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

// lynx_extension_module_* family
void* lynx_extension_module_create() { return nullptr; }
void* lynx_extension_module_create_with_finalizer() { return nullptr; }
void* lynx_extension_module_get_user_data() { return nullptr; }
void lynx_extension_module_set_napi_module_creator() {}
void lynx_extension_module_bind_lynx_view_create() {}
void lynx_extension_module_bind_lynx_view_destroy() {}
void lynx_extension_module_bind_runtime_init() {}
void lynx_extension_module_bind_runtime_attach() {}

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

}  // extern "C"
