// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// HarmonyOS entry-point stub for lynxtron_app.
//
// Currently a noop main() so the executable links cleanly during bring-up.
// `-fdata-sections / -ffunction-sections / -Wl,--gc-sections` then strips
// the (still-large) transitive set of references that LynxtronMain would
// pull in. WI-034 wave C audit (briefly delegating to LynxtronMain)
// confirmed the wave B audit was undercounting due to ld.lld's default
// --error-limit=20 truncation. The full undefined set on harmony, once
// wave A/B/C stubs are in place, is approximately:
//
//   - lynx capi second batch (15+ symbols): lynx_view_release,
//     lynx_view_builder_release, lynx_view_client_bind_on_enter_*,
//     lynx_resource_{request,response}_*,
//     lynx_generic_resource_fetcher_create_with_finalizer, ...
//   - lynx C++ class refs:
//     lynx::fml::MessageLoop::GetCurrent / GetLoopImpl
//   - NAPI weak refs (4): napi_add_finalizer_weak,
//     napi_create_function_weak, napi_fatal_error_weak,
//     napi_set_named_property_weak
//   - base/nix: base::nix::GetXDGDirectory
//     (xdg_util.cc not in is_harmony block of base/BUILD.gn)
//   - partition_alloc: partition_alloc::internal::OnNoMemory
//
// All of these need an additional wave (WI-034 wave D / WI-034 wave E).
// Wave C closes:
//   - chromium base ProcessMetrics (Process::CreationTime,
//     ProcessMetrics::GetCumulativeCPUUsage / GetIdleWakeupsPerSecond) —
//     resolved by extending base/BUILD.gn `if (is_linux || is_chromeos)`
//     block with `|| is_harmony`, persisted as a new base patch.
//   - 50+ lynx capi stubs across lynx_load_meta_/template_data_/
//     update_meta_/view_/view_builder_/view_client_/extension_module_/
//     log_/generic_resource_fetcher_/strdup/vsync_observer_/
//     env_set_node_platform.
//   - lynxtron::api::Menu::New, NativeImage::CreateThumbnailFromPath.
//
// To preserve the wave A 33 MB ELF link milestone, this file remains
// a noop. Wave D will add the second-batch stubs and finally flip the
// entry to `return LynxtronMain(argc, argv);`.

int main(int argc, char* argv[]) {
  return 0;
}
