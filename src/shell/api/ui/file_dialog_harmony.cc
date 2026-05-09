// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/api/ui/file_dialog.h"

#include <utility>

#include "shell/common/gin_helper/dictionary.h"
#include "shell/common/gin_helper/promise.h"

namespace file_dialog {

// HarmonyOS bring-up stubs for file_dialog free functions and the
// DialogSettings struct ctor/dtor. Declared in shell/api/ui/file_dialog.h
// (cross-platform, no #if guard) but defined only in
// file_dialog_mac.mm / file_dialog_win.cc.
//
// User-facing entry points reject the dialog request - on macOS/Windows the
// callers reject promises with an error string, so harmony does the same.
// Real impl will use OHOS @ohos.file.picker NAPI once HAP packaging
// (WI-035) lands the host bridge.

DialogSettings::DialogSettings() = default;
DialogSettings::DialogSettings(const DialogSettings&) = default;
DialogSettings::~DialogSettings() = default;

bool ShowOpenDialogSync(const DialogSettings& settings,
                        std::vector<base::FilePath>* paths) {
  return false;
}

void ShowOpenDialog(const DialogSettings& settings,
                    gin_helper::Promise<gin_helper::Dictionary> promise) {
  promise.RejectWithErrorMessage(
      "file_dialog::ShowOpenDialog is not implemented on HarmonyOS bring-up "
      "(WI-034 wave C / WI-035)");
}

std::optional<base::FilePath> ShowSaveDialogSync(
    const DialogSettings& settings) {
  return std::nullopt;
}

void ShowSaveDialog(const DialogSettings& settings,
                    gin_helper::Promise<gin_helper::Dictionary> promise) {
  promise.RejectWithErrorMessage(
      "file_dialog::ShowSaveDialog is not implemented on HarmonyOS bring-up "
      "(WI-034 wave C / WI-035)");
}

}  // namespace file_dialog
