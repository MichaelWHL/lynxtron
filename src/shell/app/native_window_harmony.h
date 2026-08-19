// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#ifndef SHELL_APP_NATIVE_WINDOW_HARMONY_H_
#define SHELL_APP_NATIVE_WINDOW_HARMONY_H_

#include <cstdint>

namespace lynxtron {

// Called by the XComponent surface lifecycle when ArkUI changes the content
// size. The update is delivered on Lynxtron's UI sequence so its LynxView
// updates the viewport used for both rendering and pointer hit testing.
void UpdateHarmonyNativeWindowSize(int width, int height);

// Per-window variant. The NAPI bridge sets a thread-local current window id
// from setWindowId/setWindowIdForWindow and passes it through the surface
// callback so multi-window setups route size updates correctly.
void UpdateHarmonyNativeWindowSizeForWindow(int32_t harmony_window_id,
                                            int width,
                                            int height);

// Exported from native_window_harmony.cc with C linkage. Declared inside the
// namespace so surface_render_harmony.cc can call it as lynxtron::....
extern "C" void LynxtronSetHarmonySurfaceSize(int width, int height);
extern "C" void LynxtronSetHarmonySurfaceSizeForWindow(int32_t harmony_window_id,
                                                       int width,
                                                       int height);

}  // namespace lynxtron

#endif  // SHELL_APP_NATIVE_WINDOW_HARMONY_H_
