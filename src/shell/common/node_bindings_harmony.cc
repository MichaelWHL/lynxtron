// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/common/node_bindings.h"

namespace lynxtron {

// HarmonyOS bring-up stub: link-blocker resolution for NodeBindings::Create()
// (declared in shell/common/node_bindings.h:123, defined only in
// node_bindings_win.cc:59 and node_bindings_mac.cc:53 with no #if fallback).
// Returns nullptr until WI-034 wires libuv polling on OHOS musl.
//
// NodeBindings is abstract (PollEvents()=0). The natural production impl on
// harmony is to mirror NodeBindingsMac's select(2)-based polling — OHOS musl
// supports POSIX select identically to macOS BSD, so the body of
// node_bindings_mac.cc:30-50 is portable. Promotion to a real
// NodeBindingsHarmony derived class is tracked in WI-034.
//
// For bring-up the factory returning nullptr is enough because
// main_harmony.cc currently does not invoke NodeBindings::Create().
// static
std::unique_ptr<NodeBindings> NodeBindings::Create() {
  return nullptr;
}

}  // namespace lynxtron
