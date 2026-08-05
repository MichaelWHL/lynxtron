// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#ifndef SHELL_APP_LYNX_BRINGUP_HARMONY_H_
#define SHELL_APP_LYNX_BRINGUP_HARMONY_H_

namespace lynxtron {

// Roadmap step 2 bring-up shortcut: once the XComponent surface exists, build a
// LynxView (which attaches the GLDirect windowless renderer from step 1) and
// load a staged test bundle (resfile/resources/main.lynx.bundle) directly from
// C++, so we get a first real Lynx frame without waiting on the JS app to drive
// LynxWindow.loadURL. The product path stays JS-driven (Br W -> LynxWindow);
// this is a controlled bring-up path to prove the render pipe end to end.
//
// Safe to call multiple times (surface created/changed); only the first call
// builds and loads. Posts the work onto the UI thread task runner.
void LynxtronStartLynxBringup(void* window, int width, int height);

}  // namespace lynxtron

#endif  // SHELL_APP_LYNX_BRINGUP_HARMONY_H_
