// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// HarmonyOS entry-point stub for lynxtron_app.
//
// Currently a noop main() so the executable links cleanly during bring-up.
// `-fdata-sections / -ffunction-sections / -Wl,--gc-sections` then strips
// the still-large transitive set of references that LynxtronMain would
// pull in.
//
// Resolved across waves A-E:
//   wave A: lynxtron_lib re-attached, v8 platform-linux on harmony,
//           lynx_capi_stubs first cut.
//   wave B: file_dialog / message_box / process_singleton stubs +
//           POSIX wiring for process_singleton_posix.cc.
//   wave C: chromium base process_linux on harmony, 50+ lynx capi
//           mass stubs, Menu::New, NativeImage stub.
//   wave D: chromium base nix/xdg + dwarf_helpers + base_paths on
//           harmony, second-batch lynx capi (view_release / client_
//           bind_on_enter_*), lynx::fml::MessageLoop stub TU.
//   wave E: lynx_extension_module_bind_* second batch (5),
//           napi_*_weak first/second batches (~28), napi v8 bridge
//           (3, primjs typed), partition_alloc::OnNoMemory,
//           v8::internal::trap_handler::* stubs.
//
// Wave E audit (briefly LynxtronMain) shows the still-undefined set
// continues to grow as each gc-sections barrier is lifted; current
// outstanding ~25:
//   base::MessagePumpEpoll::*              (5 ctor/dtor/Watch/Stop)
//   base::debug::StackTrace::OutputToStreamWithPrefixImpl (1)
//   lynx_resource_request_get_type / get_url               (2)
//   lynx_resource_response_callback / set_data             (2)
//   partition_alloc internal+hooks+ThreadCache (~13)
//   napi *_weak third batch (likely more, hidden by ld.lld --error-limit)
//
// The real link target (LynxtronMain executable) is gated behind a
// large transitive set unique to lynxtron's full Application/MainParts/
// NodeBindings/LynxView path; each resolved batch reveals the next.
// Continuing as wave-style stubs would converge eventually but the
// effort is better spent in WI-035 which can take a structural
// approach (lynx weak-node-api wiring, base/v8 BUILD.gn scoped
// audits, possibly --gc-sections=off for the bring-up phase, or
// dropping lynxtron_app to a HAP shared_library that selectively
// exports only what the OHOS Ability bridge needs).
//
// To preserve the 33 MB ELF link milestone (wave A), this entry stays
// noop. Waves A-E stubs remain in place for the WI-035 audit baseline.

int main(int argc, char* argv[]) {
  return 0;
}
