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
#include <napi/native_api.h>
#include <stdlib.h>

#include <mutex>
#include <thread>

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
// native EGLNativeWindow (an OHNativeWindow*) to OnSurfaceCreated below. The
// bridge forwards the surface to Lynxtron's GL compositor.
// ---------------------------------------------------------------------------

void* g_native_window = nullptr;

// Resolved from liblynxtron.so (loaded via dlopen in EnsureLynxtronLoaded).
// Skia GL rendering lives in the main library where Skia is linked.
using SetSurfaceFn = void (*)(void* window, int width, int height);
SetSurfaceFn g_set_surface = nullptr;

// LynxtronSendPointerEvent(phase, x, y, buttons) — forwards input to the
// LynxView's windowless renderer. phase: 0=down,1=up,2=move,3=hover.
using SendPointerFn = void (*)(int phase, double x, double y, int64_t buttons);
SendPointerFn g_send_pointer = nullptr;

void ForwardPointer(int phase, double x, double y, int64_t buttons) {
  OH_LOG_INFO(LOG_APP, "[XC] pointer phase=%{public}d x=%{public}f y=%{public}f b=%{public}lld",
              phase, x, y, (long long)buttons);
  if (!g_send_pointer) {
    if (!g_lynxtron_handle) return;
    g_send_pointer = reinterpret_cast<SendPointerFn>(
        dlsym(g_lynxtron_handle, "LynxtronSendPointerEvent"));
    if (!g_send_pointer) return;
  }
  g_send_pointer(phase, x, y, buttons);
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
    default:
      return;
  }
  ForwardPointer(phase, te.x, te.y, buttons);
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
  ForwardPointer(phase, me.x, me.y, buttons);
}

void DispatchHoverEvent(OH_NativeXComponent* component, bool isHover) {}

OH_NativeXComponent_MouseEvent_Callback g_mouse_callback = {
    .DispatchMouseEvent = DispatchMouseEvent,
    .DispatchHoverEvent = DispatchHoverEvent,
};

napi_value Init(napi_env env, napi_value exports) {
  OH_LOG_INFO(LOG_APP, "Init() called by OHOS framework");

  napi_property_descriptor desc[] = {
      {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default,
       nullptr},
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
