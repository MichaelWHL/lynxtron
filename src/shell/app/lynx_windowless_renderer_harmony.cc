// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/app/lynx_windowless_renderer_harmony.h"

#include <EGL/egl.h>
#include <GLES3/gl3.h>
#include <hilog/log.h>
#include <pthread.h>

#include <map>
#include <mutex>
#include <utility>

#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x0000
#define LOG_TAG "LynxtronWLR"
#define WLR_LOG(fmt, ...) OH_LOG_INFO(LOG_APP, "[WLR] " fmt, ##__VA_ARGS__)
#define WLR_ERR(fmt, ...) OH_LOG_ERROR(LOG_APP, "[WLR] " fmt, ##__VA_ARGS__)

namespace lynxtron {

namespace {

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
};

std::mutex g_mutex;
std::shared_ptr<EglWindowlessRenderer> g_current;
int g_surface_w = 0;
int g_surface_h = 0;

}  // namespace

std::shared_ptr<lynx::pub::LynxWindowlessRenderer>
CreateHarmonyWindowlessRenderer(void* egl_window, int width, int height) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (g_current && g_current->window() == egl_window) {
    return g_current;
  }

  // Do NOT create EGL here (this runs on the surface-callback thread). EGL is
  // created lazily in OnGLMakeCurrent on Clay's GPU thread.
  auto renderer = std::make_shared<EglWindowlessRenderer>(egl_window);
  // InitIfNeeded() binds the capi callbacks and needs weak_from_this(), so it
  // must run after the shared_ptr owns the object.
  renderer->InitIfNeeded();
  g_current = renderer;
  g_surface_w = width;
  g_surface_h = height;
  WLR_LOG("Windowless GLDirect renderer created %{public}dx%{public}d "
          "(EGL deferred to gpu thread)", width, height);
  return renderer;
}

std::shared_ptr<lynx::pub::LynxWindowlessRenderer>
GetCurrentHarmonyWindowlessRenderer() {
  std::lock_guard<std::mutex> lock(g_mutex);
  return g_current;
}

bool GetCurrentHarmonySurfaceSize(int* w, int* h) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (g_surface_w <= 0 || g_surface_h <= 0) return false;
  if (w) *w = g_surface_w;
  if (h) *h = g_surface_h;
  return true;
}

}  // namespace lynxtron

// Exported for the NAPI bridge (dlsym'd like LynxtronSetNativeSurface). Forwards
// an XComponent pointer/mouse event to the current LynxView's windowless
// renderer so Lynx can hit-test and dispatch it (button clicks, hover, etc.).
//   phase: 0=down, 1=up, 2=move, 3=hover
//   buttons: bitmask, bit0 = primary/left
extern "C" __attribute__((visibility("default"))) void LynxtronSendPointerEvent(
    int phase, double x, double y, int64_t buttons) {
  auto r = lynxtron::GetCurrentHarmonyWindowlessRenderer();
  if (!r) return;
  lynx_pointer_event_t ev = {};
  ev.struct_size = sizeof(ev);
  switch (phase) {
    case 0:
      ev.phase = kLynxPointerPhaseDown;
      break;
    case 1:
      ev.phase = kLynxPointerPhaseUp;
      break;
    case 2:
      ev.phase = kLynxPointerPhaseMove;
      break;
    default:
      ev.phase = kLynxPointerPhaseHover;
      break;
  }
  ev.x = x;
  ev.y = y;
  ev.device = 0;
  ev.device_kind = kLynxPointerDeviceKindMouse;
  ev.buttons = buttons;
  ev.scale = 1.0;
  r->SendPointerEvent(&ev);
}
