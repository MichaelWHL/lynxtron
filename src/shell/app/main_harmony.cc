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
// Resolved across waves A-D:
//   wave A: lynxtron_lib re-attached as :lynxtron_lib dep, v8 platform-
//           linux.cc on harmony, lynx_capi_stubs first cut.
//   wave B: file_dialog / message_box / process_singleton stubs +
//           POSIX wiring for process_singleton_posix.cc.
//   wave C: chromium base process_linux.cc / process_metrics_linux.cc
//           on harmony (ProcessMetrics + Process::CreationTime), 50+
//           lynx capi mass stubs, Menu::New, NativeImage stub.
//   wave D: chromium base nix/xdg_util.cc + dwarf_helpers + base_paths
//           on harmony, lynx_view_*/builder_release/client_bind_on_*
//           second batch, lynx::fml::MessageLoop stub TU.
//
// Remaining (deferred to WI-034 wave E or WI-035):
//   - lynx_extension_module_bind_{enter_background,enter_foreground,
//     on_destroy,runtime_detach,runtime_ready} (5)
//   - NAPI weak + v8 bridge:
//       napi_add_finalizer_weak / napi_call_function_weak /
//       napi_create_function_weak / napi_create_reference_weak /
//       napi_create_threadsafe_function_weak / napi_delete_reference_weak /
//       napi_fatal_error_weak / napi_get_cb_info_weak /
//       napi_get_reference_value_weak / napi_set_named_property_weak /
//       napi_typeof_weak (11 weak); napi_get_env_context_v8 /
//       napi_js_value_to_v8_value / napi_v8_value_to_js_value (3 v8 bridge)
//   - partition_alloc::internal::OnNoMemory(unsigned long)
//
// Wave E will likely fix napi via wiring lynx/third_party/napi target
// dependencies into src/shell/lynx:lynx_lib group, mirroring the WI-034
// wave A lynx_capi_stubs trade-off but for the napi side. Once those
// land this file flips to `return LynxtronMain(argc, argv);`.

int main(int argc, char* argv[]) {
  return 0;
}
