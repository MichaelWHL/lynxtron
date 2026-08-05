// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Small OHOS NAPI bridge that ETS imports as `liblynxtron_napi.so`.
//
// This .so is intentionally tiny and does NOT link to lynxtron_lib (which
// would drag in Node.js and pollute the export table with internal napi_*
// symbols, confusing the OHOS NAPI framework). It uses the OHOS system
// NAPI (libace_napi.z.so) cleanly via the standard <napi/native_api.h>
// header from the OHOS NDK sysroot.
//
// Mirrors chromium114-electron/src/ohos/adapter/native_initializer.cc
// which builds libadapter.so as the ETS-facing bridge while the big
// libelectron.so stays out of the import path.

#include <ace/xcomponent/native_interface_xcomponent.h>
#include <dlfcn.h>
#include <hilog/log.h>
#include <inputmethod/inputmethod_attach_options_capi.h>
#include <inputmethod/inputmethod_controller_capi.h>
#include <inputmethod/inputmethod_cursor_info_capi.h>
#include <inputmethod/inputmethod_inputmethod_proxy_capi.h>
#include <inputmethod/inputmethod_text_avoid_info_capi.h>
#include <inputmethod/inputmethod_text_config_capi.h>
#include <inputmethod/inputmethod_text_editor_proxy_capi.h>
#include <napi/native_api.h>
#include <stdlib.h>
#include <unistd.h>

#include <mutex>
#include <string>
#include <thread>
#include <chrono>

#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x0000
#define LOG_TAG "LynxtronBridge"

namespace {

using LynxtronMainFn = int (*)(int, char**);

void* g_lynxtron_handle = nullptr;
LynxtronMainFn g_lynxtron_main = nullptr;

bool EnsureLynxtronLoaded() {
  if (g_lynxtron_main) return true;

  // Try RTLD_NOLOAD first — if the system already loaded liblynxtron.so
  // (because it's in libs/arm64-v8a/), this returns its handle without
  // running static initializers, avoiding partition_alloc dlopen crashes.
  OH_LOG_INFO(LOG_APP, "dlopen liblynxtron.so (NOLOAD)...");
  g_lynxtron_handle = dlopen("liblynxtron.so", RTLD_NOLOAD);
  if (!g_lynxtron_handle) {
    OH_LOG_INFO(LOG_APP, "Not preloaded, trying RTLD_NOW...");
    g_lynxtron_handle = dlopen("liblynxtron.so", RTLD_NOW);
  }
  if (!g_lynxtron_handle) {
    OH_LOG_ERROR(LOG_APP, "dlopen liblynxtron.so FAILED: %{public}s",
                 dlerror());
    return false;
  }
  OH_LOG_INFO(LOG_APP, "dlopen liblynxtron.so OK: %{public}p",
              g_lynxtron_handle);

  g_lynxtron_main = reinterpret_cast<LynxtronMainFn>(
      dlsym(g_lynxtron_handle, "LynxtronMain"));
  if (!g_lynxtron_main) {
    OH_LOG_ERROR(LOG_APP, "dlsym LynxtronMain FAILED: %{public}s",
                 dlerror());
    return false;
  }
  OH_LOG_INFO(LOG_APP, "LynxtronMain symbol @ %{public}p",
              (void*)g_lynxtron_main);
  return true;
}

napi_value Start(napi_env env, napi_callback_info info) {
  OH_LOG_INFO(LOG_APP, "Start() called from ETS");

  // Mirrors electron_main_ohos.cc: Node.js module resolution needs NODE_PATH
  // pointing at the HAP libs directory (where bundled .so / asar deps live).
  setenv("NODE_PATH",
         "/data/storage/el1/bundle/libs/arm64/node_modules.asar.unpacked/:"
         "/data/storage/el1/bundle/libs/arm64/",
         /*overwrite=*/1);
  OH_LOG_INFO(LOG_APP, "NODE_PATH set");

  if (!EnsureLynxtronLoaded()) {
    napi_throw_error(env, nullptr, "Failed to load liblynxtron.so");
    return nullptr;
  }

  // LynxtronMain runs chromium's blocking run_loop->Run(). The OHOS UIAbility
  // main (ETS) thread must keep pumping the ArkUI event loop, so running
  // LynxtronMain here would trigger THREAD_BLOCK watchdog (6s) and force-exit.
  // Spawn it on a dedicated thread (detached) so both loops coexist.
  static std::once_flag started;
  std::call_once(started, [] {
    std::thread([] {
      OH_LOG_INFO(LOG_APP, "LynxtronMain thread start...");
      static char argv0[] = "lynxtron";
      char* argv[] = {argv0, nullptr};
      int rc = g_lynxtron_main(1, argv);
      OH_LOG_INFO(LOG_APP, "LynxtronMain returned rc=%{public}d", rc);
      _exit(rc);
    }).detach();
  });

  napi_value result = nullptr;
  napi_create_int32(env, 0, &result);
  return result;
}

// ---------------------------------------------------------------------------
// XComponent surface plumbing
//
// The ETS <XComponent type="surface" libraryname="lynxtron_napi"/> hands its
// native EGLNativeWindow (an OHNativeWindow*) to OnSurfaceCreated below. For
// bring-up we bring up EGL on that window and clear it to a solid color to
// prove the surface reaches the screen. Once the Lynx/Chromium GL compositor
// is wired, this surface becomes NativeWindowHarmony::surface_ and the
// compositor's EGLSurface renders here instead of the test clear.
// ---------------------------------------------------------------------------

void* g_native_window = nullptr;

// Resolved from liblynxtron.so (loaded via dlopen in EnsureLynxtronLoaded).
// Skia GL rendering lives in the main library where Skia is linked.
using SetSurfaceFn = void (*)(void* window, int width, int height);
SetSurfaceFn g_set_surface = nullptr;

// The native adapter owns Lynx's pointer state machine.  Pass the full source
// information so it can issue Add/Remove around XComponent's less complete
// mouse/touch stream.
using SendPointerFn = void (*)(int phase, double x, double y, int64_t buttons,
                               int32_t device, int kind, size_t timestamp);
SendPointerFn g_send_pointer = nullptr;

using SendKeyFn = void (*)(int type, uint64_t logical, uint64_t physical,
                           double timestamp);
using SendTextFn = void (*)(const char* text, double timestamp);
using GetTextInputStateFn = bool (*)(float*, float*, float*, float*);
using GetTitleFn = const char* (*)();
SendKeyFn g_send_key = nullptr;
SendTextFn g_send_text = nullptr;
SendTextFn g_send_composing_text = nullptr;
GetTextInputStateFn g_get_text_input_state = nullptr;
GetTitleFn g_get_title = nullptr;

// Lynx logical key ids (see ToLynxLogicalKey below for the full mapping).
constexpr uint64_t kLogicalBackspace = 0x00100000008ULL;
constexpr uint64_t kLogicalEnter = 0x0010000000dULL;
constexpr uint64_t kLogicalDelete = 0x0010000007fULL;
constexpr uint64_t kLogicalArrowDown = 0x00100000301ULL;
constexpr uint64_t kLogicalArrowLeft = 0x00100000302ULL;
constexpr uint64_t kLogicalArrowRight = 0x00100000303ULL;
constexpr uint64_t kLogicalArrowUp = 0x00100000304ULL;

double NowMicros() {
  return std::chrono::duration<double, std::micro>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}

void ForwardPointer(int phase, double x, double y, int64_t buttons,
                    int32_t device, int kind, size_t timestamp) {
  OH_LOG_INFO(LOG_APP, "[XC] pointer phase=%{public}d x=%{public}f y=%{public}f b=%{public}lld",
              phase, x, y, (long long)buttons);
  if (!g_send_pointer) {
    if (!g_lynxtron_handle) return;
    g_send_pointer = reinterpret_cast<SendPointerFn>(
        dlsym(g_lynxtron_handle, "LynxtronSendPointerEvent"));
    if (!g_send_pointer) return;
  }
  g_send_pointer(phase, x, y, buttons, device, kind, timestamp);
}

void ForwardSurface(OH_NativeXComponent* component, void* window) {
  if (!window) return;

  uint64_t w = 0, h = 0;
  OH_NativeXComponent_GetXComponentSize(component, window, &w, &h);
  OH_LOG_INFO(LOG_APP, "[XC] surface size %{public}llux%{public}llu",
              (unsigned long long)w, (unsigned long long)h);

  if (!g_set_surface) {
    if (!EnsureLynxtronLoaded()) {
      OH_LOG_ERROR(LOG_APP, "[XC] liblynxtron.so not loaded, cannot render");
      return;
    }
    g_set_surface = reinterpret_cast<SetSurfaceFn>(
        dlsym(g_lynxtron_handle, "LynxtronSetNativeSurface"));
    if (!g_set_surface) {
      OH_LOG_ERROR(LOG_APP, "[XC] dlsym LynxtronSetNativeSurface FAILED: "
                   "%{public}s", dlerror());
      return;
    }
  }
  g_set_surface(window, static_cast<int>(w), static_cast<int>(h));
}

void OnSurfaceCreated(OH_NativeXComponent* component, void* window) {
  OH_LOG_INFO(LOG_APP, "[XC] OnSurfaceCreated window=%{public}p", window);
  g_native_window = window;
  ForwardSurface(component, window);
}

void OnSurfaceChanged(OH_NativeXComponent* component, void* window) {
  OH_LOG_INFO(LOG_APP, "[XC] OnSurfaceChanged");
  ForwardSurface(component, window);
}

void OnSurfaceDestroyed(OH_NativeXComponent* component, void* window) {
  OH_LOG_INFO(LOG_APP, "[XC] OnSurfaceDestroyed");
  g_native_window = nullptr;
}

void DispatchTouchEvent(OH_NativeXComponent* component, void* window) {
  OH_NativeXComponent_TouchEvent te;
  if (OH_NativeXComponent_GetTouchEvent(component, window, &te) != 0) return;
  int phase;
  int64_t buttons = 1;  // touch acts as primary button
  switch (te.type) {
    case OH_NATIVEXCOMPONENT_DOWN:
      phase = 0;
      break;
    case OH_NATIVEXCOMPONENT_UP:
      phase = 1;
      buttons = 0;
      break;
    case OH_NATIVEXCOMPONENT_MOVE:
      phase = 2;
      break;
    case OH_NATIVEXCOMPONENT_CANCEL:
      phase = 4;
      buttons = 0;
      break;
    default:
      return;
  }
  // Clay orders pointer and key packets by a monotonic microsecond timestamp.
  // OH_NativeXComponent timestamps use a platform-specific unit, so forwarding
  // them verbatim can make a later IME commit appear older than its focus tap.
  const size_t timestamp = static_cast<size_t>(NowMicros());
  ForwardPointer(phase, te.x, te.y, buttons, static_cast<int32_t>(te.deviceId),
                 /*touch=*/2, timestamp);
  if (te.type == OH_NATIVEXCOMPONENT_UP || te.type == OH_NATIVEXCOMPONENT_CANCEL) {
    ForwardPointer(5, te.x, te.y, 0, static_cast<int32_t>(te.deviceId),
                   /*touch=*/2, timestamp);
  }
}

OH_NativeXComponent_Callback g_xc_callback = {
    .OnSurfaceCreated = OnSurfaceCreated,
    .OnSurfaceChanged = OnSurfaceChanged,
    .OnSurfaceDestroyed = OnSurfaceDestroyed,
    .DispatchTouchEvent = DispatchTouchEvent,
};

// ---- Mouse (HarmonyOS PC) ----
void DispatchMouseEvent(OH_NativeXComponent* component, void* window) {
  OH_NativeXComponent_MouseEvent me;
  if (OH_NativeXComponent_GetMouseEvent(component, window, &me) != 0) return;
  int64_t buttons = 0;
  if (me.button == OH_NATIVEXCOMPONENT_LEFT_BUTTON) buttons = 1;
  else if (me.button == OH_NATIVEXCOMPONENT_RIGHT_BUTTON) buttons = 2;
  else if (me.button == OH_NATIVEXCOMPONENT_MIDDLE_BUTTON) buttons = 4;
  int phase;
  switch (me.action) {
    case OH_NATIVEXCOMPONENT_MOUSE_PRESS:
      phase = 0;
      if (buttons == 0) buttons = 1;
      break;
    case OH_NATIVEXCOMPONENT_MOUSE_RELEASE:
      phase = 1;
      buttons = 0;
      break;
    case OH_NATIVEXCOMPONENT_MOUSE_MOVE:
      phase = (buttons != 0) ? 2 : 3;  // drag vs hover
      break;
    default:
      return;
  }
  ForwardPointer(phase, me.x, me.y, buttons, /*device=*/0,
                 /*mouse=*/1, static_cast<size_t>(NowMicros()));
}

void DispatchHoverEvent(OH_NativeXComponent* component, bool isHover) {}

OH_NativeXComponent_MouseEvent_Callback g_mouse_callback = {
    .DispatchMouseEvent = DispatchMouseEvent,
    .DispatchHoverEvent = DispatchHoverEvent,
};

uint64_t ToLynxLogicalKey(OH_NativeXComponent_KeyCode code) {
  switch (code) {
    case KEY_DEL: return 0x00100000008ULL;
    case KEY_TAB: return 0x00100000009ULL;
    case KEY_ENTER:
    case KEY_NUMPAD_ENTER: return 0x0010000000dULL;
    case KEY_ESCAPE: return 0x0010000001bULL;
    case KEY_SPACE: return 0x20ULL;
    case KEY_FORWARD_DEL: return 0x0010000007fULL;
    case KEY_DPAD_DOWN: return 0x00100000301ULL;
    case KEY_DPAD_LEFT: return 0x00100000302ULL;
    case KEY_DPAD_RIGHT: return 0x00100000303ULL;
    case KEY_DPAD_UP: return 0x00100000304ULL;
    case KEY_MOVE_END: return 0x00100000305ULL;
    case KEY_MOVE_HOME: return 0x00100000306ULL;
    case KEY_PAGE_DOWN: return 0x00100000307ULL;
    case KEY_PAGE_UP: return 0x00100000308ULL;
    case KEY_INSERT: return 0x00100000407ULL;
    case KEY_CTRL_LEFT: return 0x00200000100ULL;
    case KEY_CTRL_RIGHT: return 0x00200000101ULL;
    case KEY_SHIFT_LEFT: return 0x00200000102ULL;
    case KEY_SHIFT_RIGHT: return 0x00200000103ULL;
    case KEY_ALT_LEFT: return 0x00200000104ULL;
    case KEY_ALT_RIGHT: return 0x00200000105ULL;
    case KEY_META_LEFT: return 0x00200000106ULL;
    case KEY_META_RIGHT: return 0x00200000107ULL;
    default:
      if (code >= KEY_A && code <= KEY_Z) return static_cast<uint64_t>('a' + code - KEY_A);
      if (code >= KEY_0 && code <= KEY_9) return static_cast<uint64_t>('0' + code - KEY_0);
      if (code >= KEY_F1 && code <= KEY_F12) return 0x00100000800ULL + code - KEY_F1 + 1;
      return 0;
  }
}

void DispatchKeyEvent(OH_NativeXComponent* component, void*) {
  OH_NativeXComponent_KeyEvent* key_event = nullptr;
  if (OH_NativeXComponent_GetKeyEvent(component, &key_event) != 0 || !key_event) return;
  OH_NativeXComponent_KeyAction action = OH_NATIVEXCOMPONENT_KEY_ACTION_UNKNOWN;
  OH_NativeXComponent_KeyCode code = KEY_UNKNOWN;
  if (OH_NativeXComponent_GetKeyEventAction(key_event, &action) != 0 ||
      OH_NativeXComponent_GetKeyEventCode(key_event, &code) != 0 ||
      action == OH_NATIVEXCOMPONENT_KEY_ACTION_UNKNOWN) return;
  if (!g_send_key && g_lynxtron_handle) {
    g_send_key = reinterpret_cast<SendKeyFn>(dlsym(g_lynxtron_handle, "LynxtronSendKeyEvent"));
  }
  if (g_send_key) {
    g_send_key(action == OH_NATIVEXCOMPONENT_KEY_ACTION_UP ? 0 : 1,
               ToLynxLogicalKey(code), 0, NowMicros());
  }
}

// ---------------------------------------------------------------------------
// HarmonyOS native input method client
//
// XComponent draws its own text, so it has no ArkUI text node the system IME
// can bind to. The inputmethod NDK exists for exactly this case: we register an
// InputMethod_TextEditorProxy and become the text client ourselves, the same
// way the Windows TextInputPlugin and the macOS NSTextInputClient do for Clay.
//
// The previous approach — floating a transparent ArkUI TextInput over the
// surface and forwarding its onChange — cannot work on this build: the IME
// leaves characters in the proxy's *preview text* buffer (AceTextField
// SetPreviewText) and onChange never fires, so nothing was ever forwarded. It
// also stole focus from XComponent, which killed physical-key handling.
// ---------------------------------------------------------------------------

std::mutex g_ime_mutex;
InputMethod_TextEditorProxy* g_editor_proxy = nullptr;
InputMethod_InputMethodProxy* g_ime_proxy = nullptr;  // non-null == attached
// Caret rect last reported by Lynx, in surface-local physical pixels.
double g_caret_x = 0, g_caret_y = 0, g_caret_w = 1, g_caret_h = 1;
// Window the editor lives in, published from ETS (see SetWindowId). The input
// method service routes keyboard focus per window, so leaving this unset can
// leave an attached client that never receives text.
int32_t g_window_id = -1;

napi_ref g_ability_context_ref = nullptr;
std::string g_last_synced_title;

void ForwardKey(uint64_t logical) {
  if (!g_send_key && g_lynxtron_handle) {
    g_send_key = reinterpret_cast<SendKeyFn>(
        dlsym(g_lynxtron_handle, "LynxtronSendKeyEvent"));
  }
  if (!g_send_key) return;
  // Clay's editable acts on key-down (or repeat) and ignores the up, but send
  // both so the focus manager's pressed-key bookkeeping stays balanced.
  g_send_key(1, logical, 0, NowMicros());
  g_send_key(0, logical, 0, NowMicros());
}

// The IME hands us UTF-16; Lynx wants UTF-8. Lone surrogates are dropped
// rather than encoded, so a truncated pair can never produce invalid UTF-8.
std::string Utf16ToUtf8(const char16_t* text, size_t length) {
  std::string out;
  out.reserve(length * 3);
  for (size_t i = 0; i < length; ++i) {
    uint32_t cp = text[i];
    if (cp >= 0xD800 && cp <= 0xDBFF) {
      if (i + 1 >= length) break;
      uint32_t low = text[i + 1];
      if (low < 0xDC00 || low > 0xDFFF) continue;
      cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
      ++i;
    } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
      continue;  // unpaired low surrogate
    }
    if (cp < 0x80) {
      out.push_back(static_cast<char>(cp));
    } else if (cp < 0x800) {
      out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp < 0x10000) {
      out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else {
      out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
  }
  return out;
}

// ---- InputMethod_TextEditorProxy callbacks (IPC thread) ----
//
// Everything below hands off to liblynxtron.so exports that re-post onto the
// Lynx UI runner, so running on the IME's IPC thread is safe.

void OnImeGetTextConfig(InputMethod_TextEditorProxy*,
                        InputMethod_TextConfig* config) {
  OH_TextConfig_SetInputType(config, IME_TEXT_INPUT_TYPE_TEXT);
  OH_TextConfig_SetEnterKeyType(config, IME_ENTER_KEY_DONE);
  // Preview (pre-edit) text is off for now: Lynx's composing region semantics
  // are not verified against repeated preview updates yet. With it off the IME
  // only calls InsertText, with the fully committed candidate string — correct
  // for both Latin and CJK input, just without the inline pre-edit underline.
  OH_TextConfig_SetPreviewTextSupport(config, false);
  OH_TextConfig_SetSelection(config, 0, 0);

  {
    std::lock_guard<std::mutex> lock(g_ime_mutex);
    if (g_window_id >= 0) {
      OH_TextConfig_SetWindowId(config, g_window_id);
    }
    InputMethod_CursorInfo* cursor = nullptr;
    if (OH_TextConfig_GetCursorInfo(config, &cursor) == IME_ERR_OK && cursor) {
      OH_CursorInfo_SetRect(cursor, g_caret_x, g_caret_y, g_caret_w, g_caret_h);
    }
    OH_LOG_INFO(LOG_APP, "[IME] GetTextConfig served (windowId=%{public}d)",
                g_window_id);
  }
}

void OnImeInsertText(InputMethod_TextEditorProxy*, const char16_t* text,
                     size_t length) {
  std::string utf8 = Utf16ToUtf8(text, length);
  if (utf8.empty()) return;
  if (!g_send_text && g_lynxtron_handle) {
    g_send_text = reinterpret_cast<SendTextFn>(
        dlsym(g_lynxtron_handle, "LynxtronSendTextInput"));
  }
  OH_LOG_INFO(LOG_APP, "[IME] InsertText bytes=%{public}zu dispatch=%{public}d",
              utf8.size(), g_send_text != nullptr);
  if (g_send_text) g_send_text(utf8.c_str(), NowMicros());
}

void OnImeDeleteForward(InputMethod_TextEditorProxy*, int32_t length) {
  OH_LOG_INFO(LOG_APP, "[IME] DeleteForward len=%{public}d", length);
  for (int32_t i = 0; i < length; ++i) ForwardKey(kLogicalDelete);
}

void OnImeDeleteBackward(InputMethod_TextEditorProxy*, int32_t length) {
  OH_LOG_INFO(LOG_APP, "[IME] DeleteBackward len=%{public}d", length);
  for (int32_t i = 0; i < length; ++i) ForwardKey(kLogicalBackspace);
}

void OnImeSendKeyboardStatus(InputMethod_TextEditorProxy*,
                             InputMethod_KeyboardStatus status) {
  OH_LOG_INFO(LOG_APP, "[IME] keyboard status=%{public}d", (int)status);
}

void OnImeSendEnterKey(InputMethod_TextEditorProxy*,
                       InputMethod_EnterKeyType) {
  ForwardKey(kLogicalEnter);
}

void OnImeMoveCursor(InputMethod_TextEditorProxy*,
                     InputMethod_Direction direction) {
  switch (direction) {
    case IME_DIRECTION_UP: ForwardKey(kLogicalArrowUp); break;
    case IME_DIRECTION_DOWN: ForwardKey(kLogicalArrowDown); break;
    case IME_DIRECTION_LEFT: ForwardKey(kLogicalArrowLeft); break;
    case IME_DIRECTION_RIGHT: ForwardKey(kLogicalArrowRight); break;
    default: break;
  }
}

void OnImeHandleSetSelection(InputMethod_TextEditorProxy*, int32_t start,
                             int32_t end) {
  OH_LOG_INFO(LOG_APP, "[IME] setSelection %{public}d..%{public}d", start, end);
}

void OnImeHandleExtendAction(InputMethod_TextEditorProxy*,
                             InputMethod_ExtendAction action) {
  OH_LOG_INFO(LOG_APP, "[IME] extendAction=%{public}d", (int)action);
}

// Lynx does not expose the editor's surrounding text to the embedder, so these
// report "nothing available". IMEs treat that as an editor without context and
// fall back to context-free candidates, which is correct if unpolished.
void OnImeGetLeftText(InputMethod_TextEditorProxy*, int32_t, char16_t*,
                      size_t* length) {
  if (length) *length = 0;
}

void OnImeGetRightText(InputMethod_TextEditorProxy*, int32_t, char16_t*,
                       size_t* length) {
  if (length) *length = 0;
}

int32_t OnImeGetTextIndexAtCursor(InputMethod_TextEditorProxy*) { return 0; }

int32_t OnImeReceivePrivateCommand(InputMethod_TextEditorProxy*,
                                   InputMethod_PrivateCommand**, size_t) {
  return IME_ERR_OK;
}

int32_t OnImeSetPreviewText(InputMethod_TextEditorProxy*, const char16_t* text,
                            size_t length, int32_t, int32_t) {
  // Preview support is declared off in GetTextConfig, so this should not be
  // reached; forward it anyway rather than silently dropping input if some IME
  // ignores the flag.
  std::string utf8 = Utf16ToUtf8(text, length);
  if (!g_send_composing_text && g_lynxtron_handle) {
    g_send_composing_text = reinterpret_cast<SendTextFn>(
        dlsym(g_lynxtron_handle, "LynxtronSendComposingText"));
  }
  OH_LOG_INFO(LOG_APP, "[IME] SetPreviewText bytes=%{public}zu", utf8.size());
  if (g_send_composing_text) g_send_composing_text(utf8.c_str(), NowMicros());
  return IME_ERR_OK;
}

void OnImeFinishTextPreview(InputMethod_TextEditorProxy*) {
  if (!g_send_composing_text && g_lynxtron_handle) {
    g_send_composing_text = reinterpret_cast<SendTextFn>(
        dlsym(g_lynxtron_handle, "LynxtronSendComposingText"));
  }
  OH_LOG_INFO(LOG_APP, "[IME] FinishTextPreview");
  if (g_send_composing_text) g_send_composing_text("", NowMicros());
}

// Builds the editor proxy once. Returns false if the NDK rejects any callback.
bool EnsureEditorProxy() {
  if (g_editor_proxy) return true;
  g_editor_proxy = OH_TextEditorProxy_Create();
  if (!g_editor_proxy) {
    OH_LOG_ERROR(LOG_APP, "[IME] OH_TextEditorProxy_Create failed");
    return false;
  }
  // Every setter must succeed: Attach rejects a proxy with any callback unset.
  OH_TextEditorProxy_SetGetTextConfigFunc(g_editor_proxy, OnImeGetTextConfig);
  OH_TextEditorProxy_SetInsertTextFunc(g_editor_proxy, OnImeInsertText);
  OH_TextEditorProxy_SetDeleteForwardFunc(g_editor_proxy, OnImeDeleteForward);
  OH_TextEditorProxy_SetDeleteBackwardFunc(g_editor_proxy, OnImeDeleteBackward);
  OH_TextEditorProxy_SetSendKeyboardStatusFunc(g_editor_proxy,
                                               OnImeSendKeyboardStatus);
  OH_TextEditorProxy_SetSendEnterKeyFunc(g_editor_proxy, OnImeSendEnterKey);
  OH_TextEditorProxy_SetMoveCursorFunc(g_editor_proxy, OnImeMoveCursor);
  OH_TextEditorProxy_SetHandleSetSelectionFunc(g_editor_proxy,
                                               OnImeHandleSetSelection);
  OH_TextEditorProxy_SetHandleExtendActionFunc(g_editor_proxy,
                                               OnImeHandleExtendAction);
  OH_TextEditorProxy_SetGetLeftTextOfCursorFunc(g_editor_proxy,
                                                OnImeGetLeftText);
  OH_TextEditorProxy_SetGetRightTextOfCursorFunc(g_editor_proxy,
                                                 OnImeGetRightText);
  OH_TextEditorProxy_SetGetTextIndexAtCursorFunc(g_editor_proxy,
                                                 OnImeGetTextIndexAtCursor);
  OH_TextEditorProxy_SetReceivePrivateCommandFunc(g_editor_proxy,
                                                  OnImeReceivePrivateCommand);
  OH_TextEditorProxy_SetSetPreviewTextFunc(g_editor_proxy, OnImeSetPreviewText);
  OH_TextEditorProxy_SetFinishTextPreviewFunc(g_editor_proxy,
                                              OnImeFinishTextPreview);
  OH_LOG_INFO(LOG_APP, "[IME] editor proxy ready");
  return true;
}

void AttachIme() {
  if (g_ime_proxy || !EnsureEditorProxy()) return;
  InputMethod_AttachOptions* options = OH_AttachOptions_Create(true);
  if (!options) {
    OH_LOG_ERROR(LOG_APP, "[IME] OH_AttachOptions_Create failed");
    return;
  }
  InputMethod_ErrorCode rc =
      OH_InputMethodController_Attach(g_editor_proxy, options, &g_ime_proxy);
  OH_AttachOptions_Destroy(options);
  if (rc != IME_ERR_OK) {
    OH_LOG_ERROR(LOG_APP, "[IME] Attach FAILED rc=%{public}d", (int)rc);
    g_ime_proxy = nullptr;
    return;
  }
  OH_LOG_INFO(LOG_APP, "[IME] attached, keyboard requested");
}

void DetachIme() {
  if (!g_ime_proxy) return;
  InputMethod_ErrorCode rc = OH_InputMethodController_Detach(g_ime_proxy);
  OH_LOG_INFO(LOG_APP, "[IME] detached rc=%{public}d", (int)rc);
  g_ime_proxy = nullptr;
}

// Published once from EntryAbility.onWindowStageCreate.
napi_value SetWindowId(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {};
  int32_t id = -1;
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) == napi_ok &&
      argc == 1) {
    napi_get_value_int32(env, argv[0], &id);
  }
  {
    std::lock_guard<std::mutex> lock(g_ime_mutex);
    g_window_id = id;
  }
  OH_LOG_INFO(LOG_APP, "[IME] windowId=%{public}d", id);
  napi_value result = nullptr;
  napi_get_undefined(env, &result);
  return result;
}

napi_value SetAbilityContext(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {};
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) == napi_ok &&
      argc == 1 && argv[0] != nullptr) {
    if (g_ability_context_ref) {
      napi_delete_reference(env, g_ability_context_ref);
    }
    napi_create_reference(env, argv[0], 1, &g_ability_context_ref);
    OH_LOG_INFO(LOG_APP, "abilityContext stored");
  }
  napi_value result = nullptr;
  napi_get_undefined(env, &result);
  return result;
}

// Polled from the ArkUI thread. Attaching there keeps GetTextConfig on the
// UI thread, which is what the NDK documents for the config callback.
void SyncImeImpl(napi_env env) {
  if (!g_get_text_input_state && g_lynxtron_handle) {
    g_get_text_input_state = reinterpret_cast<GetTextInputStateFn>(
        dlsym(g_lynxtron_handle, "LynxtronGetTextInputState"));
  }
  float x = 0, y = 0, w = 1, h = 1;
  bool visible =
      g_get_text_input_state && g_get_text_input_state(&x, &y, &w, &h);

  bool caret_moved = false;
  {
    std::lock_guard<std::mutex> lock(g_ime_mutex);
    caret_moved = g_caret_x != x || g_caret_y != y || g_caret_h != h;
    g_caret_x = x;
    g_caret_y = y;
    g_caret_w = w > 0 ? w : 1;
    g_caret_h = h > 0 ? h : 1;
  }

  if (visible && !g_ime_proxy) {
    AttachIme();
  } else if (!visible && g_ime_proxy) {
    DetachIme();
  } else if (visible && g_ime_proxy && caret_moved) {
    // Keeps the candidate window anchored to the caret as it moves.
    InputMethod_CursorInfo* cursor = OH_CursorInfo_Create(x, y, w, h);
    if (cursor) {
      OH_InputMethodProxy_NotifyCursorUpdate(g_ime_proxy, cursor);
      OH_CursorInfo_Destroy(cursor);
    }
  }
}

void SyncWindowTitle(napi_env env) {
  if (!g_ability_context_ref) return;
  if (!g_get_title && g_lynxtron_handle) {
    g_get_title = reinterpret_cast<GetTitleFn>(
        dlsym(g_lynxtron_handle, "LynxtronGetWindowTitle"));
  }
  if (!g_get_title) return;
  const char* title = g_get_title();
  if (!title || !title[0] || title == g_last_synced_title) return;
  g_last_synced_title = title;
  napi_value context = nullptr;
  napi_get_reference_value(env, g_ability_context_ref, &context);
  if (!context) return;
  napi_value setMissionLabel = nullptr;
  napi_get_named_property(env, context, "setMissionLabel", &setMissionLabel);
  napi_value label = nullptr;
  napi_create_string_utf8(env, title, NAPI_AUTO_LENGTH, &label);
  napi_call_function(env, context, setMissionLabel, 1, &label, nullptr);
  OH_LOG_INFO(LOG_APP, "[Title] setMissionLabel dispatched");
}

napi_value SyncIme(napi_env env, napi_callback_info) {
  SyncImeImpl(env);
  SyncWindowTitle(env);
  napi_value result = nullptr;
  napi_get_boolean(env, g_ime_proxy != nullptr, &result);
  return result;
}

napi_value SendText(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {};
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc != 1) {
    napi_throw_type_error(env, nullptr, "sendText requires one UTF-8 string");
    return nullptr;
  }
  size_t length = 0;
  if (napi_get_value_string_utf8(env, argv[0], nullptr, 0, &length) != napi_ok || !length) {
    napi_value result = nullptr; napi_get_undefined(env, &result); return result;
  }
  // Reserve the NUL slot requested by N-API. Writing that terminator into a
  // string whose logical size is only |length| is not guaranteed to be safe.
  std::string text(length + 1, '\0');
  napi_get_value_string_utf8(env, argv[0], text.data(), text.size(), &length);
  text.resize(length);
  if (!g_send_text && g_lynxtron_handle) {
    g_send_text = reinterpret_cast<SendTextFn>(dlsym(g_lynxtron_handle, "LynxtronSendTextInput"));
  }
  OH_LOG_INFO(LOG_APP, "[IME] committed text bytes=%{public}zu dispatch=%{public}d",
              text.size(), g_send_text != nullptr);
  if (g_send_text) g_send_text(text.c_str(), NowMicros());
  napi_value result = nullptr; napi_get_undefined(env, &result); return result;
}

napi_value GetTextInputState(napi_env env, napi_callback_info) {
  if (!g_get_text_input_state && g_lynxtron_handle) {
    g_get_text_input_state = reinterpret_cast<GetTextInputStateFn>(
        dlsym(g_lynxtron_handle, "LynxtronGetTextInputState"));
  }
  float x = 0, y = 0, width = 1, height = 1;
  bool visible = g_get_text_input_state && g_get_text_input_state(&x, &y, &width, &height);
  napi_value result = nullptr; napi_create_object(env, &result);
  napi_value value = nullptr;
  napi_get_boolean(env, visible, &value); napi_set_named_property(env, result, "visible", value);
  napi_create_double(env, x, &value); napi_set_named_property(env, result, "x", value);
  napi_create_double(env, y, &value); napi_set_named_property(env, result, "y", value);
  napi_create_double(env, width, &value); napi_set_named_property(env, result, "width", value);
  napi_create_double(env, height, &value); napi_set_named_property(env, result, "height", value);
  return result;
}

napi_value GetWindowTitle(napi_env env, napi_callback_info) {
  if (!g_get_title && g_lynxtron_handle) {
    g_get_title = reinterpret_cast<GetTitleFn>(
        dlsym(g_lynxtron_handle, "LynxtronGetWindowTitle"));
  }
  const char* title = g_get_title ? g_get_title() : "";
  napi_value result = nullptr;
  napi_create_string_utf8(env, title, NAPI_AUTO_LENGTH, &result);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  OH_LOG_INFO(LOG_APP, "Init() called by OHOS framework");

  napi_property_descriptor desc[] = {
      {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default,
       nullptr},
      {"sendText", nullptr, SendText, nullptr, nullptr, nullptr, napi_default,
       nullptr},
      {"getTextInputState", nullptr, GetTextInputState, nullptr, nullptr,
       nullptr, napi_default, nullptr},
      {"syncIme", nullptr, SyncIme, nullptr, nullptr, nullptr, napi_default,
       nullptr},
      {"setWindowId", nullptr, SetWindowId, nullptr, nullptr, nullptr,
       napi_default, nullptr},
      {"getWindowTitle", nullptr, GetWindowTitle, nullptr, nullptr, nullptr,
       napi_default, nullptr},
      {"setAbilityContext", nullptr, SetAbilityContext, nullptr, nullptr,
       nullptr, napi_default, nullptr},
  };
  napi_status status = napi_define_properties(
      env, exports, sizeof(desc) / sizeof(desc[0]), desc);
  OH_LOG_INFO(LOG_APP, "napi_define_properties status=%{public}d",
              (int)status);

  // Pull the OH_NativeXComponent* off the exports object and register our
  // surface lifecycle callbacks.
  napi_value xc_value = nullptr;
  if (napi_get_named_property(env, exports, OH_NATIVE_XCOMPONENT_OBJ,
                             &xc_value) == napi_ok &&
      xc_value != nullptr) {
    OH_NativeXComponent* xc = nullptr;
    if (napi_unwrap(env, xc_value, reinterpret_cast<void**>(&xc)) == napi_ok &&
        xc != nullptr) {
      int32_t r = OH_NativeXComponent_RegisterCallback(xc, &g_xc_callback);
      OH_LOG_INFO(LOG_APP, "[XC] RegisterCallback ret=%{public}d", r);
      int32_t rm =
          OH_NativeXComponent_RegisterMouseEventCallback(xc, &g_mouse_callback);
      OH_LOG_INFO(LOG_APP, "[XC] RegisterMouseEventCallback ret=%{public}d", rm);
      int32_t rk = OH_NativeXComponent_RegisterKeyEventCallback(xc, DispatchKeyEvent);
      OH_LOG_INFO(LOG_APP, "[XC] RegisterKeyEventCallback ret=%{public}d", rk);
    } else {
      OH_LOG_ERROR(LOG_APP, "[XC] napi_unwrap xcomponent failed");
    }
  } else {
    OH_LOG_ERROR(LOG_APP, "[XC] no OH_NATIVE_XCOMPONENT_OBJ in exports");
  }

  return exports;
}

}  // namespace

napi_module lynxtron_napi_module = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = Init,
    .nm_modname = "lynxtron_napi",
    .nm_priv = nullptr,
    .reserved = {nullptr},
};

extern "C" __attribute__((constructor)) void RegisterLynxtronNapiModule() {
  OH_LOG_INFO(LOG_APP, "Bridge constructor — registering NAPI module");
  napi_module_register(&lynxtron_napi_module);
  OH_LOG_INFO(LOG_APP, "Bridge constructor done");
}
