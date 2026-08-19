// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/app/lynx_windowless_renderer_harmony.h"

#include <EGL/egl.h>
#include <GLES3/gl3.h>
#include <hilog/log.h>
#include <pthread.h>

#include <chrono>
#include <map>
#include <mutex>
#include <array>
#include <set>
#include <string>
#include <utility>

#include "base/functional/bind.h"
#include "base/task/single_thread_task_runner.h"
#include "base/time/time.h"
#include "shell/common/global_thread.h"

#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x0000
#define LOG_TAG "LynxtronWLR"
#define WLR_LOG(fmt, ...) OH_LOG_INFO(LOG_APP, "[WLR] " fmt, ##__VA_ARGS__)
#define WLR_ERR(fmt, ...) OH_LOG_ERROR(LOG_APP, "[WLR] " fmt, ##__VA_ARGS__)

namespace lynxtron {

namespace {

std::mutex g_mutex;
scoped_refptr<base::SingleThreadTaskRunner> g_lynx_platform_runner;

// The runner Clay treats as its "platform thread": the Lynxtron UI thread that
// built the LynxView (captured in LynxViewBuilder::Build). Clay's custom
// platform task runner funnels through OnPostTask below, so without this the
// runner is a black hole.
scoped_refptr<base::SingleThreadTaskRunner> LynxPlatformRunner() {
  std::lock_guard<std::mutex> lock(g_mutex);
  return g_lynx_platform_runner;
}

// GLDirect windowless renderer whose GL callbacks drive an EGL context bound to
// the XComponent OHNativeWindow. Clay makes the context current on its own GPU
// thread (via OnGLMakeCurrent), renders into FBO 0 (the window's default
// framebuffer), and presents via eglSwapBuffers.
//
// EGL objects (display/surface/context) are created LAZILY on the first
// OnGLMakeCurrent, i.e. on Clay's GPU thread — NOT on the surface-callback
// thread that constructs this renderer. Creating the window surface + context
// on one thread and eglMakeCurrent-ing them on another triggers EGL_BAD_ACCESS
// (0x3002) on the OHOS EGL, which was leaving the frame only partly composited.
// Deferring keeps all EGL for this surface on the single GPU thread.
class EglWindowlessRenderer : public lynx::pub::LynxWindowlessRenderer {
 public:
  explicit EglWindowlessRenderer(void* window)
      : lynx::pub::LynxWindowlessRenderer(kRendererTypeGLDirect),
        window_(window) {}

  ~EglWindowlessRenderer() override {
    // The base dtor releases the capi renderer. Tear down EGL after that; the
    // GPU thread has stopped calling us by the time the view is destroyed.
    if (display_ != EGL_NO_DISPLAY) {
      eglMakeCurrent(display_, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
      if (context_ != EGL_NO_CONTEXT) eglDestroyContext(display_, context_);
      if (surface_ != EGL_NO_SURFACE) eglDestroySurface(display_, surface_);
    }
  }

  // Creates the EGL display/config/surface/context on the CURRENT thread (Clay's
  // GPU thread). Returns false on any EGL failure.
  bool SetupEgl(void* window) {
    display_ = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (display_ == EGL_NO_DISPLAY) {
      WLR_ERR("eglGetDisplay failed");
      return false;
    }
    EGLint major = 0, minor = 0;
    if (!eglInitialize(display_, &major, &minor)) {
      WLR_ERR("eglInitialize failed 0x%{public}x", eglGetError());
      return false;
    }
    WLR_LOG("EGL %{public}d.%{public}d", major, minor);

    const EGLint cfg_attrs[] = {EGL_SURFACE_TYPE,
                                EGL_WINDOW_BIT | EGL_PBUFFER_BIT,
                                EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
                                EGL_RED_SIZE,        8,
                                EGL_GREEN_SIZE,      8,
                                EGL_BLUE_SIZE,       8,
                                EGL_ALPHA_SIZE,      8,
                                EGL_DEPTH_SIZE,      0,
                                EGL_STENCIL_SIZE,    8,
                                EGL_NONE};
    EGLint num_cfg = 0;
    if (!eglChooseConfig(display_, cfg_attrs, &cfg_, 1, &num_cfg) ||
        num_cfg < 1) {
      WLR_ERR("eglChooseConfig failed");
      return false;
    }

    surface_ = eglCreateWindowSurface(
        display_, cfg_, reinterpret_cast<EGLNativeWindowType>(window), nullptr);
    if (surface_ == EGL_NO_SURFACE) {
      WLR_ERR("eglCreateWindowSurface failed 0x%{public}x", eglGetError());
      return false;
    }

    const EGLint ctx_attrs[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    context_ = eglCreateContext(display_, cfg_, EGL_NO_CONTEXT, ctx_attrs);
    if (context_ == EGL_NO_CONTEXT) {
      WLR_ERR("eglCreateContext failed 0x%{public}x", eglGetError());
      return false;
    }
    primary_thread_ = pthread_self();
    WLR_LOG("EGL surface+context ready for window=%{public}p (primary tid=%{public}lu)",
            window, (unsigned long)primary_thread_);
    return true;
  }

  // Returns the (surface, context) this thread should bind. The primary (first,
  // raster) thread gets the real window surface + context. Any other thread
  // (Clay's resource/IO thread) gets its OWN context that SHARES resources with
  // the primary, on a 1x1 pbuffer — the Flutter/Skia resource-context pattern.
  // This is what fixes EGL_BAD_ACCESS: the window surface stays owned by the
  // raster thread while resource threads upload textures on a shared context.
  std::pair<EGLSurface, EGLContext> SurfaceContextForThisThread() {
    pthread_t self = pthread_self();
    if (pthread_equal(self, primary_thread_)) {
      return {surface_, context_};
    }
    std::lock_guard<std::mutex> lock(threads_mutex_);
    auto it = per_thread_.find(self);
    if (it != per_thread_.end()) {
      return it->second;
    }
    const EGLint ctx_attrs[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    EGLContext ctx = eglCreateContext(display_, cfg_, context_, ctx_attrs);
    const EGLint pb_attrs[] = {EGL_WIDTH, 1, EGL_HEIGHT, 1, EGL_NONE};
    EGLSurface pb = eglCreatePbufferSurface(display_, cfg_, pb_attrs);
    if (ctx == EGL_NO_CONTEXT || pb == EGL_NO_SURFACE) {
      WLR_ERR("resource ctx/pbuffer create failed 0x%{public}x", eglGetError());
    } else {
      WLR_LOG("resource ctx+pbuffer for tid=%{public}lu", (unsigned long)self);
    }
    auto pair = std::make_pair(pb, ctx);
    per_thread_[self] = pair;
    return pair;
  }

  void* window() const { return window_; }

  // ---- GLDirect callbacks (invoked on Clay's GPU thread) ----

  bool OnGLMakeCurrent() override {
    // Lazily create EGL on the first call so all EGL for this surface lives on
    // this (Clay GPU) thread — avoids EGL_BAD_ACCESS from cross-thread binding.
    if (display_ == EGL_NO_DISPLAY) {
      if (!SetupEgl(window_)) {
        WLR_ERR("lazy SetupEgl failed on gpu thread");
        return false;
      }
    }
    auto [surf, ctx] = SurfaceContextForThisThread();
    if (eglMakeCurrent(display_, surf, surf, ctx)) {
      return true;
    }
    EGLint err = eglGetError();
    if (err == EGL_SUCCESS || eglGetCurrentContext() == ctx) {
      return true;
    }
    WLR_ERR("eglMakeCurrent failed 0x%{public}x (tid=%{public}lu)", err,
            (unsigned long)pthread_self());
    return false;
  }

  bool OnGLClearCurrent() override {
    return eglMakeCurrent(display_, EGL_NO_SURFACE, EGL_NO_SURFACE,
                          EGL_NO_CONTEXT);
  }

  // Present the window surface. Only meaningful on the primary/raster thread
  // whose bound surface IS the window surface; resource threads never present.
  bool OnGLPresent() override { return eglSwapBuffers(display_, surface_); }

  // FBO 0 == the EGL window surface's default framebuffer (renders on screen).
  uint32_t OnGLCreateFBO(int width, int height) override { return 0; }

  void* OnGLProcResolver(const char* name) override {
    return reinterpret_cast<void*>(eglGetProcAddress(name));
  }

  // Clay's custom platform task runner drains through here. Without an
  // override the base class silently drops every task, which strands anything
  // Clay schedules on its platform thread (IME commits, editor actions,
  // clipboard round-trips) forever. Run them on the Lynxtron UI thread — the
  // same thread that built the LynxView, which is what Clay was handed as its
  // platform runner.
  void OnPostTask(lynx_task_t task, uint64_t interval_nanoseconds) override {
    auto runner = LynxPlatformRunner();
    if (!runner) {
      WLR_ERR("OnPostTask dropped: no platform runner captured yet");
      return;
    }
    // The task holds a Clay-side handle that is only valid while this renderer
    // lives; drop it if the view went away before the task ran.
    auto closure = base::BindOnce(
        [](std::weak_ptr<lynx::pub::LynxWindowlessRenderer> weak,
           lynx_task_t t) {
          if (auto self = weak.lock()) {
            self->RunTask(t);
          }
        },
        weak_from_this(), task);
    if (interval_nanoseconds == 0) {
      runner->PostTask(FROM_HERE, std::move(closure));
    } else {
      runner->PostDelayedTask(FROM_HERE, std::move(closure),
                              base::Nanoseconds(interval_nanoseconds));
    }
  }

  // The platform text client is owned by ArkUI.  These callbacks can arrive on
  // a Lynx-owned sequence, so only cache POD state here; the NAPI bridge polls
  // it from the ArkUI sequence before moving/focusing its TextInput.
  void ShowTextInput(bool show) override {
    std::lock_guard<std::mutex> lock(input_mutex_);
    text_input_visible_ = show;
    OH_LOG_INFO(LOG_APP, "[IME] ShowTextInput visible=%{public}d", show);
  }

  void SetMarkedTextRect(float x, float y, float width, float height) override {
    std::lock_guard<std::mutex> lock(input_mutex_);
    marked_rect_ = {x, y, width, height};
    OH_LOG_INFO(LOG_APP,
                "[IME] marked rect x=%{public}f y=%{public}f w=%{public}f h=%{public}f",
                x, y, width, height);
  }

  void SetEditableTransform(const float transform[16]) override {
    std::lock_guard<std::mutex> lock(input_mutex_);
    for (size_t i = 0; i < editable_transform_.size(); ++i) {
      editable_transform_[i] = transform[i];
    }
    OH_LOG_INFO(LOG_APP, "[IME] editable transform updated");
  }

  bool GetTextInputState(float* x, float* y, float* width, float* height) {
    std::lock_guard<std::mutex> lock(input_mutex_);
    // The Lynx callback uses view-local logical pixels. Apply the commonly
    // used scale/translate subset once, leaving ArkUI to add the XComponent's
    // own offset when it lays out the TextInput.
    if (x) *x = marked_rect_[0] * editable_transform_[0] + editable_transform_[12];
    if (y) *y = marked_rect_[1] * editable_transform_[5] + editable_transform_[13];
    if (width) *width = marked_rect_[2];
    if (height) *height = marked_rect_[3];
    return text_input_visible_;
  }

 private:
  EGLDisplay display_ = EGL_NO_DISPLAY;
  EGLConfig cfg_ = nullptr;
  EGLSurface surface_ = EGL_NO_SURFACE;  // window surface (primary/raster thread)
  EGLContext context_ = EGL_NO_CONTEXT;  // primary context
  void* window_ = nullptr;
  pthread_t primary_thread_ = 0;
  std::mutex threads_mutex_;
  // Per resource/IO thread: its own shared context + 1x1 pbuffer.
  std::map<pthread_t, std::pair<EGLSurface, EGLContext>> per_thread_;
  std::mutex input_mutex_;
  bool text_input_visible_ = false;
  std::array<float, 4> marked_rect_ = {0, 0, 1, 1};
  std::array<float, 16> editable_transform_ = {
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
};

std::shared_ptr<EglWindowlessRenderer> g_current;
int g_surface_w = 0;
int g_surface_h = 0;

// ---------------------------------------------------------------------------
// Global UI task runner for windowless mode
//
// Lynx's UIThread is what Clay/Lynx post their vsync ticks, animation frames
// and element patches onto. Left to itself, LynxUIRendererWindowless calls
// base::UIThread::Init(), which does
// fml::MessageLoop::EnsureInitializedForCurrentThread() on whatever thread
// built the view -- here the Lynxtron (chromium) UI thread. Chromium's RunLoop
// knows nothing about that fml loop and never pumps it, so every task posted to
// UIThread::GetRunner() is silently dropped forever: no vsync callback, no
// animation tick, no patch. The first frame still shows up because it goes
// through the synchronous load path.
//
// The windowless C API exists for exactly this: hand Lynx a delegate that
// forwards onto a runner the host actually drives. It must be installed before
// any windowless renderer is created (once installed, UIThread::InitTaskRunner
// is a no-op because HasInit() is already true).
//
// Note this is why the Windows build works without it: the UIThread::Init()
// call in LynxUIRendererWindowless is guarded by #if !defined(OS_WIN).
// ---------------------------------------------------------------------------

scoped_refptr<base::SingleThreadTaskRunner> LynxUiRunner() {
  auto runner = LynxPlatformRunner();
  if (!runner) {
    runner = lynxtron::GetUIThreadTaskRunner();
  }
  return runner;
}

bool UiRunsOnCurrentThread(void* /*user_data*/) {
  auto runner = LynxUiRunner();
  return runner && runner->RunsTasksInCurrentSequence();
}

// Clay hands us an absolute deadline on the same clock fml::TimePoint uses
// (steady_clock nanoseconds since epoch); convert it to a relative delay.
void UiPostTask(lynx_task_t task, uint64_t target_time_nanos,
                void* /*user_data*/) {
  auto runner = LynxUiRunner();
  if (!runner) {
    WLR_ERR("[UITASK] dropped: no UI runner yet");
    return;
  }
  auto closure = base::BindOnce([](lynx_task_t t) {
    lynx_windowless_run_ui_task(t);
  }, task);

  const uint64_t now = static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::nanoseconds>(
          std::chrono::steady_clock::now().time_since_epoch())
          .count());
  if (target_time_nanos > now) {
    runner->PostDelayedTask(FROM_HERE, std::move(closure),
                            base::Nanoseconds(target_time_nanos - now));
  } else {
    runner->PostTask(FROM_HERE, std::move(closure));
  }
}

// Installs the delegate exactly once. Must run before the first LynxView (and
// therefore the first LynxUIRendererWindowless) is built.
void EnsureGlobalUiTaskRunner() {
  static std::once_flag once;
  std::call_once(once, [] {
    lynx_windowless_ui_task_runner_config_t config = {};
    config.struct_size = sizeof(config);
    config.user_data = nullptr;
    config.runs_on_current_thread_callback = &UiRunsOnCurrentThread;
    config.post_task_callback = &UiPostTask;
    const bool ok = lynx_windowless_set_global_ui_task_runner(&config);
    WLR_LOG("[UITASK] set_global_ui_task_runner ok=%{public}d", ok ? 1 : 0);
  });
}

}  // namespace

std::shared_ptr<lynx::pub::LynxWindowlessRenderer>
CreateHarmonyWindowlessRenderer(void* egl_window, int width, int height) {
  // Must happen before the first LynxView is built, i.e. before anything can
  // call base::UIThread::Init() and claim the (never-pumped) fml loop.
  EnsureGlobalUiTaskRunner();
  std::lock_guard<std::mutex> lock(g_mutex);
  // ArkUI reuses the same OHNativeWindow across full-screen transitions. Keep
  // these dimensions current even when no renderer must be recreated; they
  // seed native-window geometry and must match incoming XComponent coordinates.
  g_surface_w = width;
  g_surface_h = height;
  if (g_current && g_current->window() == egl_window) {
    WLR_LOG("XComponent surface resized %{public}dx%{public}d", width, height);
    return g_current;
  }

  // Do NOT create EGL here (this runs on the surface-callback thread). EGL is
  // created lazily in OnGLMakeCurrent on Clay's GPU thread.
  auto renderer = std::make_shared<EglWindowlessRenderer>(egl_window);
  // InitIfNeeded() binds the capi callbacks and needs weak_from_this(), so it
  // must run after the shared_ptr owns the object.
  renderer->InitIfNeeded();
  g_current = renderer;
  WLR_LOG("Windowless GLDirect renderer created %{public}dx%{public}d "
          "(EGL deferred to gpu thread)", width, height);
  return renderer;
}

std::shared_ptr<lynx::pub::LynxWindowlessRenderer>
GetCurrentHarmonyWindowlessRenderer() {
  std::lock_guard<std::mutex> lock(g_mutex);
  return g_current;
}

void CaptureHarmonyLynxPlatformTaskRunner() {
  std::lock_guard<std::mutex> lock(g_mutex);
  g_lynx_platform_runner = base::SingleThreadTaskRunner::GetCurrentDefault();
  WLR_LOG("Captured Lynx platform task runner");
}

bool GetCurrentHarmonySurfaceSize(int* w, int* h) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (g_surface_w <= 0 || g_surface_h <= 0) return false;
  if (w) *w = g_surface_w;
  if (h) *h = g_surface_h;
  return true;
}

bool GetCurrentHarmonyTextInputState(float* x, float* y, float* width,
                                     float* height) {
  std::lock_guard<std::mutex> lock(g_mutex);
  return g_current && g_current->GetTextInputState(x, y, width, height);
}

}  // namespace lynxtron

namespace {

// XComponent callbacks run on ArkUI's UIAbility thread, whereas the Lynx
// windowless renderer is owned by Lynxtron's UI runner.  Sending directly from
// ArkUI lets the call cross the C ABI but bypasses Clay's sequence-affinity
// assumptions, so focused editable controls never notify their text client.
void PostToLynxUi(base::OnceClosure task) {
  scoped_refptr<base::SingleThreadTaskRunner> runner =
      lynxtron::LynxPlatformRunner();
  if (!runner) {
    runner = lynxtron::GetUIThreadTaskRunner();
  }
  if (runner) {
    runner->PostTask(FROM_HERE, std::move(task));
  }
}

void SendPointerOnLynxUi(int phase, double x, double y, int64_t buttons,
                         int32_t device, int kind, size_t timestamp) {
  auto r = lynxtron::GetCurrentHarmonyWindowlessRenderer();
  if (!r) return;
  // Keep the event stream as small as the reference GLFW embedder does (a click
  // is just Down -> Up, never Add/Remove: Clay maps Remove to Cancel, which
  // undoes a completed tap). The one thing we must NOT leave zeroed is
  // device_kind: EmbedderEngine treats a zeroed device_kind as a legacy embedder
  // and reports the event as a MOUSE, so Lynx receives mousedown/mouseup and
  // `bindtap` -- which is part of the touch event family -- never fires.
  lynx_pointer_event_t ev = {};
  ev.struct_size = sizeof(ev);
  switch (phase) {
    case 0: ev.phase = kLynxPointerPhaseDown; break;
    case 1: ev.phase = kLynxPointerPhaseUp; break;
    case 2: ev.phase = kLynxPointerPhaseMove; break;
    case 4: ev.phase = kLynxPointerPhaseCancel; break;
    case 5: return;  // upstream embedders never emit Remove
    default: ev.phase = kLynxPointerPhaseHover; break;
  }
  ev.x = x;
  ev.y = y;
  ev.timestamp = timestamp;
  ev.device = device;
  ev.device_kind = static_cast<lynx_pointer_device_kind_e>(kind);
  // For touch, EmbedderEngine fills in the contact button itself; passing our
  // own mouse-style mask here would be wrong.
  if (kind != 2) {
    ev.buttons = buttons;
  }
  r->SendPointerEvent(&ev);
}

void SendKeyOnLynxUi(int type, uint64_t logical, uint64_t physical,
                     double timestamp) {
  auto r = lynxtron::GetCurrentHarmonyWindowlessRenderer();
  if (!r) return;
  lynx_key_event_t ev = {};
  ev.struct_size = sizeof(ev);
  ev.timestamp = timestamp;
  ev.type = type == 0 ? kLynxKeyEventTypeUp : kLynxKeyEventTypeDown;
  ev.logical = logical;
  ev.physical = physical;
  ev.synthesized = false;
  r->SendKeyEvent(&ev);
}

void SendTextOnLynxUi(std::string text, double timestamp, bool composing) {
  auto r = lynxtron::GetCurrentHarmonyWindowlessRenderer();
  if (!r) {
    WLR_LOG("[IME] drop text: renderer unavailable");
    return;
  }
  WLR_LOG("[IME] dispatch %{public}s bytes=%{public}zu",
          composing ? "composing" : "committed", text.size());
  lynx_key_event_t ev = {};
  ev.struct_size = sizeof(ev);
  ev.timestamp = timestamp;
  // Repeat marks pre-edit text, Down marks a final commit — see the windowless
  // UI renderer's send_key_event bridge, which splits on exactly this.
  ev.type = composing ? kLynxKeyEventTypeRepeat : kLynxKeyEventTypeDown;
  ev.character = text.c_str();
  // IME text is generated by the platform input method rather than a physical
  // key. Clay uses this marker to route the character payload to the focused
  // text input (the macOS embedder's TypeText does the same).
  ev.synthesized = true;
  r->SendKeyEvent(&ev);
}

}  // namespace

// Exported for the NAPI bridge (dlsym'd like LynxtronSetNativeSurface). Forwards
// an XComponent pointer/mouse event to the current LynxView's windowless
// renderer so Lynx can hit-test and dispatch it (button clicks, hover, etc.).
//   phase: 0=down, 1=up, 2=move, 3=hover, 4=cancel, 5=remove
//   kind: 1=mouse, 2=touch, 3=stylus, 4=trackpad
extern "C" __attribute__((visibility("default"))) void LynxtronSendPointerEvent(
    int phase, double x, double y, int64_t buttons, int32_t device, int kind,
    size_t timestamp) {
  PostToLynxUi(base::BindOnce(&SendPointerOnLynxUi, phase, x, y, buttons,
                              device, kind, timestamp));
}

extern "C" __attribute__((visibility("default"))) void LynxtronSendKeyEvent(
    int type, uint64_t logical, uint64_t physical, double timestamp) {
  PostToLynxUi(
      base::BindOnce(&SendKeyOnLynxUi, type, logical, physical, timestamp));
}

extern "C" __attribute__((visibility("default"))) void LynxtronSendTextInput(
    const char* text, double timestamp) {
  if (!text || !*text) return;
  std::string committed_text(text);
  WLR_LOG("[IME] queue committed text bytes=%{public}zu", committed_text.size());
  PostToLynxUi(base::BindOnce(&SendTextOnLynxUi, std::move(committed_text),
                              timestamp, /*composing=*/false));
}

// Pre-edit (marked) text an IME is still composing. An empty string clears the
// composing region, which is how a cancelled composition is reported.
extern "C" __attribute__((visibility("default"))) void
LynxtronSendComposingText(const char* text, double timestamp) {
  if (!text) return;
  std::string composing_text(text);
  WLR_LOG("[IME] queue composing text bytes=%{public}zu", composing_text.size());
  PostToLynxUi(base::BindOnce(&SendTextOnLynxUi, std::move(composing_text),
                              timestamp, /*composing=*/true));
}

extern "C" __attribute__((visibility("default"))) bool LynxtronGetTextInputState(
    float* x, float* y, float* width, float* height) {
  return lynxtron::GetCurrentHarmonyTextInputState(x, y, width, height);
}
