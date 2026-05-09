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

}  // extern "C"
