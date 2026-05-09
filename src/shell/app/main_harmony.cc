// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// HarmonyOS entry-point stub for lynxtron_app.
//
// Currently a noop main() so the executable links cleanly during bring-up.
// `-fdata-sections / -ffunction-sections / -Wl,--gc-sections` then strips the
// large transitive set of references that LynxtronMain would otherwise pull
// in. WI-034 wave B audit (delegating to LynxtronMain) revealed 30+ such
// undefined symbols across four categories:
//
//   1. shell/api/ui/{file_dialog,message_box}.h cross-platform free fns
//      (stubbed in this commit via *_harmony.cc)
//   2. ProcessSingleton ctor/dtor/Cleanup/StartWatching
//      (resolved in this commit by wiring process_singleton_posix.cc into
//       the is_posix block of src/BUILD.gn, plus pulling GetHostName out
//       of the IS_MAC `#if` block in process_singleton_posix.cc)
//   3. lynx capi family (lynx_env_*, lynx_template_bundle_*, lynx_view_*,
//      lynx_view_builder_*, lynx_load_meta_*, lynx_template_data_*,
//      lynx_update_meta_*, lynxtron::api::Menu::New,
//      lynxtron::api::NativeImage::CreateThumbnailFromPath)
//      (~15 still pending; wave C / WI-035 stub batch)
//   4. chromium base private API (base::Process::CreationTime,
//      base::ProcessMetrics::GetCumulativeCPUUsage,
//      base::ProcessMetrics::GetIdleWakeupsPerSecond)
//      (3 pending; need a base patch under WI-033 follow-up)
//
// Wave B closes categories 1 + 2 only and keeps this file as noop so the
// 33 MB lynxtron ELF link milestone (WI-034 wave A) stays green. Wave C
// will add the remaining lynx capi stubs + Menu::New + NativeImage::
// CreateThumbnailFromPath, then flip this file to delegate to LynxtronMain.

int main(int argc, char* argv[]) {
  return 0;
}
