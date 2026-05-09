// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// HarmonyOS bring-up: extern "C" stubs for lynx capi entries that
// lynxtron_lib links against. Defining them inside the lynxtron tree
// avoids pulling //lynx/platform/embedder:embedder (and its
// lynx/core/runtime/lepus/ir/* tree which requires -fexceptions and
// breaks under lynxtron's -fno-exceptions cflag).
//
// Each stub matches the prototype in
//   lynx/platform/embedder/public/capi/lynx_env_capi.h
//
// The real implementations live in lynx/platform/embedder/lynx_env.cc
// and will replace these stubs once WI-035 / WI-036 wires the full
// lynx/platform/harmony group with appropriate cflag overrides for the
// lepus subtree. Until then the stubs are noop, which is safe because
// main_harmony.cc does not exercise the lynx code path during bring-up.

#include <cstdbool>
#include <cstddef>
#include <cstdlib>

extern "C" {

// Match: void lynx_env_register_extension_module(
//            const char* name, extension_module_creator creator,
//            bool is_lazy_create, void* opaque);
// `extension_module_creator` is a function-pointer typedef from
// lynx_extension_module_types_capi.h; on the link path we only need
// argument count and trivial-by-pointer signature, so use `void*`
// to keep this stub independent of the lynx capi headers.
void lynx_env_register_extension_module(const char* name,
                                        void* creator,
                                        bool is_lazy_create,
                                        void* opaque) {}

// lynx_env_set_node_platform — added by lynx patch 0004 in lynx_env.cc.
// We don't dep //lynx/platform/embedder:embedder (would pull lepus and
// break -fno-exceptions), so stub it locally.
void lynx_env_set_node_platform(void* platform) {}

// Note on ABI: linker only matches by symbol name for extern "C"; the
// stub bodies below use `void` for parameter lists where the original
// capi signatures take typed pointers / scalars. Bring-up's main_harmony.cc
// is a noop and -Wl,--gc-sections strips these stubs from the final
// binary anyway, so the ABI mismatch is unreachable. They become
// reachable in WI-034 wave D / WI-035 once main delegates to
// LynxtronMain AND the lynx code path is exercised at runtime; at that
// point the stubs will be replaced by real impls (or by deps on the
// lynx embedder source_set with -fexceptions overrides for lepus).

// Returns "" (immutable static) so callers that expect a non-null pointer
// keep working. Real version reads the lynx git revision.
const char* lynx_env_get_sdk_version(void) {
  return "";
}

// Match: void lynx_env_set_devtool_app_info(const char* name, const char* value)
void lynx_env_set_devtool_app_info(const char* name, const char* value) {}

// lynx_template_bundle_* family. Each operates on an opaque pointer
// to lynx::pub::LynxTemplateBundle (declared in
// lynx/platform/embedder/public/capi/lynx_template_bundle_capi.h).
//
// Stubs return "invalid bundle" in the caller's eyes so any consumer that
// checks lynx_template_bundle_is_valid() before use exits gracefully.

void* lynx_template_bundle_create(const char* data, size_t data_size) {
  return nullptr;
}

void lynx_template_bundle_release(void* bundle) {}

bool lynx_template_bundle_is_valid(void* bundle) {
  return false;
}

const char* lynx_template_bundle_get_error_message(void* bundle) {
  return
      "lynx_template_bundle is not implemented on HarmonyOS bring-up "
      "(WI-034 wave C / WI-035)";
}

// lynx_load_meta_* family
void* lynx_load_meta_create() { return nullptr; }
void lynx_load_meta_set_url() {}
void lynx_load_meta_set_binary_data() {}
void lynx_load_meta_set_template_bundle() {}
void lynx_load_meta_set_initial_data() {}
void lynx_load_meta_set_global_props() {}
void lynx_load_meta_release() {}

// lynx_template_data_* family
void* lynx_template_data_create_from_json() { return nullptr; }
void lynx_template_data_mark_state() {}
void lynx_template_data_set_read_only() {}
void lynx_template_data_release() {}

// lynx_update_meta_* family
void* lynx_update_meta_create() { return nullptr; }
void lynx_update_meta_set_update_data() {}
void lynx_update_meta_set_global_props() {}
void lynx_update_meta_release() {}

// lynx_view_* family
void* lynx_view_create() { return nullptr; }
void* lynx_view_get_user_data() { return nullptr; }
void lynx_view_add_client() {}
void lynx_view_remove_client() {}
void lynx_view_register_runtime_lifecycle_observer() {}
void lynx_view_load_template() {}
void lynx_view_update_data() {}
void lynx_view_reload_template() {}
void lynx_view_send_global_event() {}
void lynx_view_update_screen_metrics() {}

// lynx_view_builder_* family
void* lynx_view_builder_create() { return nullptr; }
void lynx_view_builder_set_screen_size() {}
void lynx_view_builder_set_frame() {}
void lynx_view_builder_set_font_scale() {}
void lynx_view_builder_set_icu_data_path() {}
void lynx_view_builder_set_lynx_group() {}
void lynx_view_builder_set_parent() {}
void lynx_view_builder_set_windowless_renderer() {}
void lynx_view_builder_set_generic_resource_fetcher() {}
void lynx_view_builder_register_native_module() {}
void lynx_view_builder_register_extension_module() {}
void lynx_view_builder_register_native_view() {}

// lynx_view_client_* family
void* lynx_view_client_create() { return nullptr; }
void* lynx_view_client_get_user_data() { return nullptr; }
void lynx_view_client_release() {}
void lynx_view_client_bind_on_page_start() {}
void lynx_view_client_bind_on_load_success() {}
void lynx_view_client_bind_on_first_screen() {}
void lynx_view_client_bind_on_page_updated() {}
void lynx_view_client_bind_on_data_updated() {}
void lynx_view_client_bind_on_destroy() {}
void lynx_view_client_bind_on_runtime_ready() {}
void lynx_view_client_bind_on_received_error() {}
void lynx_view_client_bind_on_enter_background() {}
void lynx_view_client_bind_on_enter_foreground() {}
void lynx_view_client_bind_on_frame_timing() {}
void lynx_view_client_bind_on_timing_setup() {}
void lynx_view_client_bind_on_timing_update() {}

// Wave D second batch of lynx capi (surfaced when wave C closed the
// first batch and ld.lld no longer hit --error-limit=20).
void lynx_view_release() {}
void lynx_view_builder_release() {}
void lynx_resource_request_release() {}
void lynx_resource_response_release() {}
void lynx_resource_response_set_code() {}
void lynx_resource_response_set_error_message() {}
void* lynx_generic_resource_fetcher_create_with_finalizer() {
  return nullptr;
}

// lynx_extension_module_* family
void* lynx_extension_module_create() { return nullptr; }
void* lynx_extension_module_create_with_finalizer() { return nullptr; }
void* lynx_extension_module_get_user_data() { return nullptr; }
void lynx_extension_module_set_napi_module_creator() {}
void lynx_extension_module_bind_lynx_view_create() {}
void lynx_extension_module_bind_lynx_view_destroy() {}
void lynx_extension_module_bind_runtime_init() {}
void lynx_extension_module_bind_runtime_attach() {}
// Wave E second batch of lynx_extension_module_bind_* (lifecycle hooks).
void lynx_extension_module_bind_runtime_detach() {}
void lynx_extension_module_bind_runtime_ready() {}
void lynx_extension_module_bind_enter_background() {}
void lynx_extension_module_bind_enter_foreground() {}
void lynx_extension_module_bind_on_destroy() {}

// lynx_log_* family
void lynx_log_init() {}
void lynx_log_set_minimum_level() {}
int lynx_log_get_minimum_level() { return 0; }
void lynx_log_write_detailed() {}

// lynx_generic_resource_fetcher_* family
void* lynx_generic_resource_fetcher_create() { return nullptr; }
void* lynx_generic_resource_fetcher_get_user_data() { return nullptr; }
void lynx_generic_resource_fetcher_bind_fetch_resource() {}
void lynx_generic_resource_fetcher_bind_fetch_resource_path() {}
void lynx_generic_resource_fetcher_bind_cancel_fetch() {}
void lynx_generic_resource_fetcher_bind_intercept_func() {}
void lynx_generic_resource_fetcher_release() {}
void lynx_generic_resource_fetcher_fetch_resource() {}
void lynx_generic_resource_fetcher_fetch_resource_path() {}

// lynx_strdup — typically declared in lynx_types.h, used by capi clients
// to copy strings into lynx-owned heap. Stub mallocs a copy; on harmony
// bring-up the lynx code path doesn't run, so the stub is never reached.
char* lynx_strdup(const char* s) {
  if (!s) return nullptr;
  size_t len = 0;
  while (s[len]) ++len;
  char* out = static_cast<char*>(malloc(len + 1));
  if (out) {
    for (size_t i = 0; i <= len; ++i) out[i] = s[i];
  }
  return out;
}

// lynx_window_* — declared inline in api_lynx_window.cc; if the linker
// reports lynx_window_* undefined, the corresponding capi headers
// (lynx_windowless_renderer_capi.h etc.) describe the family. Currently
// only one symbol surfaces in audit; expand as needed.

// lynx_vsync_observer_* family (referenced from the extension module set
// in lynx_extension_module_capi.h)
void lynx_vsync_observer_request_animation_frame() {}
void lynx_vsync_observer_request_before_animation_frame() {}

// WI-035 wave A: napi_*_weak symbols are now provided by
// //lynx/third_party/weak-node-api:weak_node_api_source (wired into
// src/shell/lynx:lynx_lib group on harmony). The wave D/E hand-written
// stub set (napi_add_finalizer_weak / call_function_weak /
// create_function_weak / create_reference_weak / create_threadsafe_*_weak
// / delete_reference_weak / fatal_error_weak / get_cb_info_weak /
// get_reference_value_weak / set_named_property_weak / typeof_weak +
// the second batch of 15) was removed to avoid linker
// "duplicate symbol" errors against the real weak_node_api.cpp defs.

// Wave E: lynx_view_* third batch (enter background/foreground hooks +
// set_frame, also revealed after the first ld.lld pass).
void lynx_view_enter_background() {}
void lynx_view_enter_foreground() {}
void lynx_view_set_frame() {}

// WI-035 wave A: lynx_resource_request / lynx_resource_response third
// batch (revealed once weak_node_api wiring removed the napi_*_weak noise
// from ld.lld).
void* lynx_resource_request_get_type() { return nullptr; }
const char* lynx_resource_request_get_url() { return ""; }
void lynx_resource_response_callback() {}
void lynx_resource_response_set_data() {}

}  // extern "C"

// Wave E: NAPI v8 bridge functions (C++ name-mangled, primjs napi flavor).
//
// Declared in lynx/third_party/napi/include/napi_env_v8.h:
//   v8::Local<v8::Context> napi_get_env_context_v8(napi_env env);
//   v8::Local<v8::Value>   napi_js_value_to_v8_value(napi_env env, napi_value value);
//   napi_value             napi_v8_value_to_js_value(napi_env env, v8::Local<v8::Value> value);
//
// `napi_env` / `napi_value` are typedef pointer to opaque struct
// `napi_env__` / `napi_value__`, which the primjs napi defines remap
// to `napi_env_primjs__` / `napi_value_primjs__` (see
// lynx/third_party/napi/include/primjs_napi_defines.h). The mangled
// name therefore embeds `napi_env_primjs__*`. We forward-declare the
// opaque struct here so the stub TU does not pull napi_env_v8.h (which
// would also drag in the weak_napi_defines macro chain).
struct napi_env_primjs__;
struct napi_value_primjs__;
#include "v8.h"  // NOLINT(build/include_subdir)

v8::Local<v8::Context> napi_get_env_context_v8(napi_env_primjs__*) {
  return v8::Local<v8::Context>();
}
v8::Local<v8::Value> napi_js_value_to_v8_value(napi_env_primjs__*,
                                               napi_value_primjs__*) {
  return v8::Local<v8::Value>();
}
napi_value_primjs__* napi_v8_value_to_js_value(napi_env_primjs__*,
                                               v8::Local<v8::Value>) {
  return nullptr;
}

// Wave E: partition_alloc::internal::OnNoMemory.
//
// lynxtron sets use_partition_alloc=false on harmony bring-up, so the
// partition_alloc component (incl. oom.cc which defines OnNoMemory) is
// not compiled. Some chromium base headers still expand the
// OOM_CRASH(size) macro to `partition_alloc::internal::OnNoMemory(size)`
// which then surfaces as an undefined link reference. Provide a stub
// that aborts (matching the [[noreturn]] contract of the real impl)
// to satisfy link without changing the use_partition_alloc gate.
//
// Real impl returns by [[noreturn]] crashing with PA-side bookkeeping;
// stub uses abort() so the OS still gets a clean SIGABRT and the
// crashpad-style upper layers can capture a core. Promotion via
// partition_alloc dep wiring is tracked under WI-035.

#include <cstdlib>  // for abort

namespace partition_alloc::internal {
[[noreturn]] void OnNoMemory(size_t size) {
  std::abort();
}
}  // namespace partition_alloc::internal

// Wave E: v8 trap_handler stubs.
//
// v8/BUILD.gn:6133 selects trap-handler-posix.cc only for
// `is_linux || is_chromeos || is_mac || is_ios || target_os == "freebsd"`,
// so harmony falls through and the trap handler symbols go undefined.
// They're called from v8 wasm and signal-handling paths that are not
// exercised on bring-up; safe to stub. Real wiring (extending v8
// BUILD.gn 6133 to include is_harmony) is tracked under WI-035 alongside
// the broader v8 platform-linux family already done in
// wire-platform-linux-harmony.patch.

#include <signal.h>  // for siginfo_t

namespace v8 {
namespace internal {
namespace trap_handler {

bool RegisterDefaultTrapHandler() {
  return false;
}

bool TryHandleSignal(int signum, siginfo_t* info, void* context) {
  return false;
}

}  // namespace trap_handler
}  // namespace internal
}  // namespace v8

// WI-035 wave A: base::debug::StackTrace::OutputToStreamWithPrefixImpl.
//
// stack_trace_posix.cc only defines this method behind
// `#if defined(HAVE_BACKTRACE)`, where HAVE_BACKTRACE is set only for
// IS_APPLE or glibc (see stack_trace_posix.cc:53-58). HarmonyOS uses
// musl libc, which doesn't ship execinfo.h / backtrace(3), so the
// method body is excluded but base/debug/stack_trace.cc:324 still
// calls it from cross-platform OutputToStreamWithPrefix - link error.
//
// Stub prints a minimal "[stack trace unavailable]" line so consumers
// (logging) get faithful output rather than crashing. Real impl would
// either patch stack_trace_posix.cc to add a non-backtrace fallback, or
// link a libc-extra (e.g. libunwind) on harmony; tracked under
// WI-036 alongside the rest of harmony platform integration.

#include <ostream>
#include "base/strings/cstring_view.h"
#include "base/debug/stack_trace.h"

namespace base {
namespace debug {

void StackTrace::OutputToStreamWithPrefixImpl(
    std::ostream* os, base::cstring_view prefix_string) const {
  if (os) {
    *os << prefix_string << "[stack trace unavailable on harmony bring-up]\n";
  }
}

}  // namespace debug
}  // namespace base

// partition_alloc internal stubs were attempted in WI-035 wave A but
// reverted: each ABI-shaped stub revealed a deeper PA internal (e.g.
// PartitionRoot::MaybeInitThreadCache pulled in PartitionAddressSpace,
// PartitionBucket::SlowPathAlloc, SpinningMutex, SlotSpanMetadata) so
// the symbol set kept growing. The principled fix is to flip
// use_partition_alloc=true on harmony (let partition_alloc's own .cc
// supply all definitions) - tracked as WI-035 wave B / WI-036.
