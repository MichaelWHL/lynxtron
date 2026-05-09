// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// HarmonyOS entry-point stub for lynxtron_app.
//
// Currently a noop main() so the executable links cleanly during bring-up.
// `-Wl,--gc-sections` strips the still-large transitive set of references
// that LynxtronMain would pull in.
//
// Resolved across waves A-E (WI-034) and WI-035 wave A:
//   WI-034 wave A: lynxtron_lib re-attached, v8 platform-linux on harmony,
//                  lynx_capi_stubs first cut.
//   WI-034 wave B: file_dialog / message_box / process_singleton stubs +
//                  POSIX wiring for process_singleton_posix.cc.
//   WI-034 wave C: chromium base process_linux on harmony, 50+ lynx capi
//                  mass stubs, Menu::New, NativeImage stub.
//   WI-034 wave D: chromium base nix/xdg + dwarf_helpers + base_paths on
//                  harmony, second-batch lynx capi, lynx::fml::MessageLoop.
//   WI-034 wave E: lynx_extension_module 2nd, ~28 napi *_weak stubs (later
//                  removed by WI-035 wave A), napi v8 bridge, partition_alloc
//                  ::OnNoMemory, v8 trap_handler stubs.
//   WI-035 wave A: STRUCTURAL - wired //lynx/third_party/weak-node-api on
//                  harmony so all napi_*_weak symbols come from real
//                  weak_node_api.cpp (replaces wave-D/E hand-written
//                  napi_*_weak stubs to avoid duplicate-symbol errors);
//                  use_epoll extended to harmony (resolves
//                  base::MessagePumpEpoll); base::debug::StackTrace::
//                  OutputToStreamWithPrefixImpl stub for musl (no
//                  HAVE_BACKTRACE on OHOS musl); lynx_resource_*
//                  fourth batch (4 stubs).
//
// Remaining (WI-035 wave B / WI-036): partition_alloc full integration.
// Wave-A stubs for PartitionAllocHooks / PartitionRoot / ThreadCache /
// FreelistCorruptionDetected etc. were attempted but reverted because
// each ABI-shaped stub revealed deeper PA internals (PartitionAddressSpace,
// PartitionBucket::SlowPathAlloc, SpinningMutex, SlotSpanMetadata). The
// principled fix is to flip use_partition_alloc=true on harmony (let
// partition_alloc's own .cc supply all definitions), but that was disabled
// in wave 2 due to musl-specific compile errors (sys/ifunc.h missing,
// glibc-style throw decl mismatch in shim). WI-035 wave B will audit
// whether those compile errors can now be resolved with the
// already-landed musl + IS_LINUX gates.
//
// To preserve the 33 MB ELF link milestone (WI-034 wave A), this entry
// stays noop. WI-035 wave A's structural wins (weak_node_api wire +
// use_epoll extension + StackTrace stub + lynx_resource batch) reduced
// the LynxtronMain-mode undefined set from ~25 to ~11 (all
// partition_alloc).

int main(int argc, char* argv[]) {
  return 0;
}
