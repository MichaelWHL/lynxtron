// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// HarmonyOS entry-point for lynxtron_app.
//
// Currently a PIE executable with a small int main() that delegates to
// LynxtronMain (mirrors shell/app/main_mac.cc). The file already carries
// the napi_init / napi_module_register scaffolding so that WI-036 wave B
// can flip src/BUILD.gn `executable` -> `shared_library` and have the
// OHOS HAP ts side `import lynxtron from 'liblynxtron.so'` work without
// further edits to this file.
//
// Why both `int main()` and `napi_module_register()` coexist here:
//   - In executable mode (current, wave A): the C runtime calls main(),
//     which calls LynxtronMain(argc, argv). The napi_module_register
//     constructor still runs at dlopen, but the OHOS NAPI registry just
//     stores the module record (no module loader actually queries for it
//     because nothing is dlopen-ing this binary). It's effectively dead
//     code today, kept for forward-compat.
//   - In shared_library mode (wave B target): main() becomes unreachable
//     (the OHOS HAP loader doesn't call C-style main on dlopen-ed libs),
//     and the napi_module_register constructor + Init / Start hook is
//     what UIAbility ts side actually calls.
//
// Switching forms is currently blocked on -fPIC global cflag rollout
// because node inspector / cppgc / etc. compile with absolute relocations
// (R_AARCH64_ADD_ABS_LO12_NC / R_AARCH64_ADR_PREL_PG_HI21) that ld.lld
// only accepts in PIE executables, not shared libraries. WI-036 wave B
// will add `-fPIC` to the toolchain's compile cflags for harmony.

#include "napi/native_api.h"

#include "shell/app/library_main.h"

namespace {

napi_value Start(napi_env env, napi_callback_info info) {
  // OHOS HAP host doesn't pass C-style argc/argv to native libs; UIAbility
  // provides per-launch metadata via napi_callback_info / Want APIs
  // instead. Bring-up smoke test passes a single argv0 so LynxtronMain's
  // CommandLine init has a valid program path and continues past the
  // `lynxtron::LynxtronCommandLine::Init(argc, argv)` call in
  // library_main.cc.
  static char argv0[] = "lynxtron";
  char* argv[] = {argv0, nullptr};
  int rc = LynxtronMain(1, argv);

  napi_value result = nullptr;
  napi_create_int32(env, rc, &result);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
      {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default,
       nullptr},
  };
  napi_define_properties(env, exports,
                         sizeof(desc) / sizeof(desc[0]), desc);
  return exports;
}

napi_module lynxtron_module = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = Init,
    .nm_modname = "lynxtron",
    .nm_priv = nullptr,
    .reserved = {0},
};

}  // namespace

extern "C" __attribute__((constructor)) void RegisterLynxtronModule() {
  napi_module_register(&lynxtron_module);
}

// Executable entry (wave A). Replaced by napi_init + UIAbility flow in
// wave B once shared_library + global -fPIC are in place.
int main(int argc, char* argv[]) {
  return LynxtronMain(argc, argv);
}
