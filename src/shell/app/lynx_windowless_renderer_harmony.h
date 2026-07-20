// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#ifndef SHELL_APP_LYNX_WINDOWLESS_RENDERER_HARMONY_H_
#define SHELL_APP_LYNX_WINDOWLESS_RENDERER_HARMONY_H_

#include <memory>

#include "lynx/platform/embedder/public/lynx_windowless_renderer.h"

namespace lynxtron {

// A GLDirect windowless renderer whose GL
// callbacks drive an EGL context created on the HarmonyOS XComponent surface
// (the OHNativeWindow handed to us via LynxtronSetNativeSurface). Clay renders
// its composited frame directly into the EGL window's default framebuffer, so
// a real Lynx bundle lands on the XComponent surface — the same GL contract the
// clay/example/glfw SurfaceDelegate implements, expressed for OHOS EGL/GLES3.
//
// Ownership model: the XComponent surface arrives asynchronously (ETS onLoad),
// while the LynxView is built later when the JS app creates it. We keep the
// renderer for the current surface in a process-global slot; the LynxView build
// path (lynx_view_builder harmony branch) fetches it and calls
// Builder::SetWindowlessRenderer().

// Creates (or returns the existing) windowless renderer bound to `egl_window`
// (an OHNativeWindow*). Also records it as the current renderer. Safe to call
// again for the same window; recreates if the window changed.
std::shared_ptr<lynx::pub::LynxWindowlessRenderer>
CreateHarmonyWindowlessRenderer(void* egl_window, int width, int height);

// Returns the renderer bound to the most recent XComponent surface, or nullptr
// if no surface has arrived yet. Used by the LynxView build path.
std::shared_ptr<lynx::pub::LynxWindowlessRenderer>
GetCurrentHarmonyWindowlessRenderer();

// Returns the most recent XComponent surface size (physical px) into *w,*h and
// true, or false if no surface has arrived yet. NativeWindowHarmony uses this so
// the LynxWindow's LynxView is sized to the real surface, not a fixed default.
bool GetCurrentHarmonySurfaceSize(int* w, int* h);

}  // namespace lynxtron

#endif  // SHELL_APP_LYNX_WINDOWLESS_RENDERER_HARMONY_H_
