// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Test case: loaded from JS via getModuleLoader().load('lynxtron_hello').
//
// Load chain:
//   JS: lynx.getModuleLoader().load('lynxtron_hello')
//     -> lynx.ts getModuleLoader() returns nativeGlobal['napiLoaderOnRT'+nativeAppId]
//     -> NapiRuntimeProxy::SetupLoader() calls napi_setup_loader(env, loader_)
//        (quickjs napi_env.cc) which mounts env.Loader()'s { load } under that
//        global name
//     -> LoadModule(napi_env.cc) calls napi_find_module("lynxtron_hello")
//        -> the NODE_API_MODULE macro (primjs quickjs napi.h) registers this
//           module's napi_module_register_xx(&_module) into the global modlist
//           at static-init time
//     -> nm_register_func(env, exports) == NativeHelloInit, returns exports
//
// This TU is compiled into lynxtron_lib (liblynxtron.so); the static
// constructor registers the module into primjs quickjs napi's global module
// chain at process startup, so no manual registration is needed before load().

#include <string>

// primjs quickjs's Napi:: C++ wrapper (not weak-node-api, no NAPI_CPP_CUSTOM_NAMESPACE).
#include "third_party/binding/napi/shim/shim_napi.h"

// shim_napi.h ends with #include primjs_napi_undefs.h, which restores bare
// names for napi_module/napi_value/napi_env from their *__primjs suffixed
// forms. The NODE_API_MODULE macro must expand while the USE_PRIMJS_NAPI
// suffix mapping is active, otherwise it would reference nonexistent or
// inconsistent bare types, so the suffix mapping is re-applied here before
// the macro expands.
#ifdef USE_PRIMJS_NAPI
#include "third_party/napi/include/primjs_napi_defines.h"
#endif

namespace {

// No args: hello() -> "Hello from Lynxtron native module!"
Napi::Value Hello(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::String::New(env, "Hello from Lynxtron native module!");
}

// add(a, b) -> a + b (coerced to number; non-numbers count as 0)
Napi::Value Add(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  double a = 0;
  double b = 0;
  if (info.Length() >= 2) {
    a = info[0].IsNumber() ? info[0].As<Napi::Number>().DoubleValue() : 0;
    b = info[1].IsNumber() ? info[1].As<Napi::Number>().DoubleValue() : 0;
  }
  return Napi::Number::New(env, a + b);
}

// echo(x) -> x (returns the argument as-is; verifies value round-trip)
Napi::Value Echo(const Napi::CallbackInfo& info) {
  if (info.Length() < 1) {
    return info.Env().Undefined();
  }
  return info[0];
}

Napi::Object NativeHelloInit(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "name"),
              Napi::String::New(env, "lynxtron_hello"));
  exports.Set(Napi::String::New(env, "version"), Napi::Number::New(env, 1));
  exports.Set(Napi::String::New(env, "hello"),
              Napi::Function::New(env, &Hello, "hello"));
  exports.Set(Napi::String::New(env, "add"),
              Napi::Function::New(env, &Add, "add"));
  exports.Set(Napi::String::New(env, "echo"),
              Napi::Function::New(env, &Echo, "echo"));
  return exports;
}

}  // namespace

NODE_API_MODULE(lynxtron_hello, NativeHelloInit)
