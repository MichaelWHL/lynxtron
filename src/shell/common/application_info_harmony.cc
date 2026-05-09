// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/common/application_info.h"

#include <string>

namespace lynxtron {

// HarmonyOS bring-up stubs for the three GetApplication* free functions
// declared cross-platform in application_info.h:28-30 but defined only in
// application_info_mac.mm and application_info_win.cc.
//
// GetApplicationName falls back to a non-empty literal because the
// cross-platform GetPossiblyOverriddenApplicationName (application_info.cc:31)
// uses an empty-string check to decide between the override and the
// platform-provided name; returning "" here would silently swap behaviour.
//
// Real impl will read the bundle metadata from the OHOS HAP entry's
// module.json5 / app.json5 (bundleName / versionName / etc.) via the NAPI
// @ohos.bundle.bundleManager API; tracked in WI-034.
//
// NOT stubbed here:
//   - GetRawAppUserModelID / GetAppUserModelID / SetAppUserModelID /
//     IsRunningInDesktopBridge (application_info.h:36-40) are inside
//     `#if BUILDFLAG(IS_WIN)` and thus not declared on harmony.

std::string GetApplicationName() {
  return "Lynxtron";
}

std::string GetApplicationVersion() {
  return std::string();
}

std::string GetApplicationId() {
  return std::string();
}

}  // namespace lynxtron
