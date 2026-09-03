// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/common/platform_util.h"

#include <cstring>
#include <hilog/log.h>
#include <string>
#include <sys/stat.h>
#include <utility>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "shell/common/platform_util_internal.h"
#include "url/gurl.h"

namespace platform_util {

namespace {

bool IsDirectory(const base::FilePath& path) {
  struct stat st;
  if (stat(path.value().c_str(), &st) != 0)
    return false;
  return S_ISDIR(st.st_mode);
}

}  // namespace

// ---------------------------------------------------------------------------
// OpenExternal handler (injected by lynxtron_napi_bridge via dlsym)
// ---------------------------------------------------------------------------

using OpenExternalHandlerFn = const char* (*)(const char* url);

static OpenExternalHandlerFn g_open_external_handler = nullptr;

extern "C" __attribute__((visibility("default"))) void
LynxtronSetOpenExternalHandler(OpenExternalHandlerFn fn) {
  g_open_external_handler = fn;
}

void OpenExternal(const GURL& url,
                  const OpenExternalOptions& /*options*/,
                  OpenCallback callback) {
  if (!g_open_external_handler) {
    OH_LOG_ERROR(LOG_APP,
                 "[PlatformUtil] OpenExternal: handler not registered");
    std::move(callback).Run(
        "platform_util::OpenExternal: handler not registered");
    return;
  }
  std::string url_str = url.spec();
  const char* error = g_open_external_handler(url_str.c_str());
  std::move(callback).Run(error ? error : "");
}

// ---------------------------------------------------------------------------
// OpenPath handler (injected by lynxtron_napi_bridge via dlsym)
//
// The ArkTS bridge routes by type:
//   directory -> openLink('filemanager://openDirectory')
//   file     -> Want { viewData, uri }
// ---------------------------------------------------------------------------

using OpenPathHandlerFn = const char* (*)(const char* path, int is_directory);

static OpenPathHandlerFn g_open_path_handler = nullptr;

extern "C" __attribute__((visibility("default"))) void
LynxtronSetOpenPathHandler(OpenPathHandlerFn fn) {
  g_open_path_handler = fn;
}

void OpenPath(const base::FilePath& full_path, OpenCallback callback) {
  if (!g_open_path_handler) {
    OH_LOG_ERROR(LOG_APP,
                 "[PlatformUtil] OpenPath: handler not registered");
    std::move(callback).Run(
        "platform_util::OpenPath: handler not registered");
    return;
  }

  bool is_directory = IsDirectory(full_path);
  std::string path_str = full_path.value();

  const char* error =
      g_open_path_handler(path_str.c_str(), is_directory ? 1 : 0);
  std::move(callback).Run(error ? error : "");
}

// ---------------------------------------------------------------------------
// Unsupported platform capabilities.
//
// These symbols are required by the shared shell bindings (api_shell.cc), but
// HarmonyOS offers no matching system feature.  Every call is logged as an
// error so the limitation is visible on device; trashItem additionally
// reports the failure through its error out-parameter, which the JS shell
// binding surfaces as a rejected promise.
// ---------------------------------------------------------------------------

void ShowItemInFolder(const base::FilePath& full_path) {
  // There is no HarmonyOS API that reveals an item in its containing folder.
  OH_LOG_ERROR(LOG_APP,
               "[PlatformUtil] shell.showItemInFolder is not supported on "
               "HarmonyOS");
}

void Beep() {
  // HarmonyOS has no terminal or system bell to ring.
  OH_LOG_ERROR(LOG_APP,
               "[PlatformUtil] shell.beep is not supported on HarmonyOS");
}

namespace internal {

bool PlatformTrashItem(const base::FilePath& path, std::string* error) {
  OH_LOG_ERROR(LOG_APP,
               "[PlatformUtil] shell.trashItem is not supported on "
               "HarmonyOS");
  *error = "shell.trashItem is not supported on HarmonyOS";
  return false;
}

}  // namespace internal

}  // namespace platform_util
