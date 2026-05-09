// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/common/platform_util.h"

#include <string>
#include <utility>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "shell/common/platform_util_internal.h"
#include "url/gurl.h"

namespace platform_util {

// HarmonyOS bring-up stubs for cross-platform free functions declared in
// platform_util.h without an #if guard but defined only in
// platform_util_mac.mm and platform_util_win.cc:
//
//   ShowItemInFolder, OpenPath, OpenExternal, Beep
//
// Plus internal::PlatformTrashItem (declared in platform_util_internal.h)
// which is invoked unconditionally from the cross-platform platform_util.cc:28.
//
// All four user-facing entry points return errors via their OpenCallback
// rather than succeeding silently, so that JS-side promise consumers see a
// faithful "not supported on harmony" error instead of a stale empty success.
//
// NOT stubbed here:
//   - GetFolderPath (platform_util.h:52) - declared inside `#if IS_WIN`
//   - GetLoginItemEnabled / SetLoginItemEnabled (h:56-60) - declared inside
//     `#if IS_MAC`
//   Those declarations are absent on harmony, so no link entry is emitted.
//
// Promotion path: OHOS provides the @ohos.app.ability.want and
// @ohos.app.ability.common APIs to launch external apps / open URLs / show
// in file manager. Real impl is tracked in WI-034.

void ShowItemInFolder(const base::FilePath& full_path) {
  // Bring-up stub: file-manager integration on harmony requires NAPI host
  // bridge to OHOS Want APIs; not exercised at bring-up.
}

void OpenPath(const base::FilePath& full_path, OpenCallback callback) {
  std::move(callback).Run(
      "platform_util::OpenPath is not implemented on HarmonyOS bring-up "
      "(WI-034)");
}

void OpenExternal(const GURL& url,
                  const OpenExternalOptions& options,
                  OpenCallback callback) {
  std::move(callback).Run(
      "platform_util::OpenExternal is not implemented on HarmonyOS bring-up "
      "(WI-034)");
}

void Beep() {
  // No console bell on HarmonyOS bring-up; OHOS audio/system feedback APIs
  // wired in WI-034.
}

namespace internal {

bool PlatformTrashItem(const base::FilePath& path, std::string* error) {
  *error =
      "platform_util::internal::PlatformTrashItem is not implemented on "
      "HarmonyOS bring-up (WI-034)";
  return false;
}

}  // namespace internal

}  // namespace platform_util
