// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/app/native_window.h"

namespace gin_helper {
class Dictionary;
}  // namespace gin_helper

namespace lynxtron {

// HarmonyOS bring-up stub: link-blocker resolution for NativeWindow::Create()
// (declared in shell/app/native_window.h:84, defined only in
// native_window_win.cc:1014 and native_window_mac.mm:1574 with no #if
// fallback). Returns nullptr until WI-034 wires real OHOS NativeWindow*
// (libnative_window.so + NAPI Ability) into Lynxtron.
//
// NativeWindow itself is abstract (Close/Focus/Show/... are = 0), so a
// production impl will derive NativeWindowHarmony in this TU. For bring-up
// the factory returning nullptr is enough because main_harmony.cc currently
// does not invoke NativeWindow::Create().
NativeWindow* NativeWindow::Create(const gin_helper::Dictionary& options,
                                   NativeWindow* parent) {
  return nullptr;
}

}  // namespace lynxtron
