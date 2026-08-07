// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#ifndef LYNXTRON_SHELL_API_API_UPDATE_CHECK_H_
#define LYNXTRON_SHELL_API_API_UPDATE_CHECK_H_

// Cross-library symbols exported from liblynxtron.so and consumed by the
// NAPI bridge (liblynxtron_napi.so) via dlsym. These use extern "C" linkage
// so dlsym can find them by unmangled name.

extern "C" {

// ---- checkAppUpdate ----
// Called by the NAPI bridge from ArkTS to check whether the JS side has
// requested an app-update check. Returns true once per request.
bool LynxtronConsumeCheckAppUpdateRequest();
// Called by the NAPI bridge with the result from ArkTS's
// updateManager.checkAppUpdate(). |json| is JSON-serialized CheckUpdateResult.
void LynxtronResolveCheckAppUpdate(const char* json);

// ---- showUpdateDialog ----
// Returns true when JS has requested showing the system update dialog.
bool LynxtronConsumeShowUpdateDialogRequest();
// Called by the NAPI bridge with the result code from
// updateManager.showUpdateDialog().
void LynxtronResolveShowUpdateDialog(int result_code);

// ---- loadProduct ----
// Returns true when JS has requested loadProduct.
// Params are hardcoded on the ArkTS side (bundleName etc.).
bool LynxtronConsumeLoadProductParams();
// Called by the NAPI bridge with the result from productViewManager.loadProduct().
// |json| is JSON: { success: bool, errorCode?: number, errorMessage?: string }
void LynxtronResolveLoadProduct(const char* json);

}  // extern "C"

#endif  // LYNXTRON_SHELL_API_API_UPDATE_CHECK_H_
