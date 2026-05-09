// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// HarmonyOS bring-up stubs for lynx::fml::MessageLoop class methods that
// lynxtron_lib references (e.g. lynx_node_module.cc -> base/include/fml/
// message_loop.h after lynx patch 0003 lands fml/platform/node). The real
// definitions live in lynx/base/src/fml/message_loop.cc and would only be
// linked in if we depped //lynx/platform/embedder:embedder, which we
// avoid because it pulls the lepus subtree (-fexceptions clash).
//
// During bring-up main_harmony.cc is noop, so these stubs are
// gc-sectioned away from the final binary. Real impl will land when
// the lynx fml integration is wired (WI-035).

#include <memory>

namespace lynx {
namespace fml {

// Minimal forward-declared TaskRunner / MessageLoopImpl / MessageLoop
// stand-ins. We forward-declare the types as opaque so the stub's class
// methods can return the correct pointer width without the lynx fml
// headers (which would compile-couple us to message_loop.h's full
// MessageLoop body).
class MessageLoopImpl;

class MessageLoop {
 public:
  static MessageLoop& GetCurrent();
  std::shared_ptr<MessageLoopImpl> GetLoopImpl() const;

 private:
  static MessageLoop& StubInstance();
};

// `static`
MessageLoop& MessageLoop::GetCurrent() {
  return StubInstance();
}

std::shared_ptr<MessageLoopImpl> MessageLoop::GetLoopImpl() const {
  return nullptr;
}

// `static`
MessageLoop& MessageLoop::StubInstance() {
  // No leak in practice because main_harmony.cc bring-up does not touch
  // this path; if it ever does we want a deterministic singleton.
  static MessageLoop instance;
  return instance;
}

}  // namespace fml
}  // namespace lynx
