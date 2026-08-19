// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#ifndef SHELL_APP_NATIVE_WINDOW_HARMONY_H_
#define SHELL_APP_NATIVE_WINDOW_HARMONY_H_

namespace lynxtron {

// Called by the XComponent surface lifecycle when ArkUI changes the content
// size. The update is delivered on Lynxtron's UI sequence so its LynxView
// updates the viewport used for both rendering and pointer hit testing.
void UpdateHarmonyNativeWindowSize(int width, int height);

}  // namespace lynxtron

#endif  // SHELL_APP_NATIVE_WINDOW_HARMONY_H_
