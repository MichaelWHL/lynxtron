// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// HarmonyOS entry-point for lynxtron_app.
// Identical shape to shell/app/main_mac.cc - delegates to the cross-platform
// LynxtronMain.

#include "shell/app/library_main.h"

int main(int argc, char* argv[]) {
  return LynxtronMain(argc, argv);
}
