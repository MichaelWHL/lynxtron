// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Minimal HarmonyOS entry-point stub for lynxtron_app.
// Real entry is expected to be a .so loaded by an OHOS host bundle (HAP);
// keeping this main() so the GN executable target links cleanly during
// bring-up. Will be replaced with shared_library + napi_init when shell/app
// platform code is filled in.

int main(int argc, char* argv[]) {
  return 0;
}
