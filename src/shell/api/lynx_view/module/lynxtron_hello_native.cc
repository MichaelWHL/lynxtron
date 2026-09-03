// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Test-only native module, loaded from JS with:
//   lynx.getModuleLoader().load('lynxtron_hello')
//
// Load path:
//   JS: lynx.getModuleLoader().load('lynxtron_hello')
//     -> lynx.ts getModuleLoader() returns
//        nativeGlobal['napiLoaderOnRT' + nativeAppId]
//     -> NapiRuntimeProxy::SetupLoader() calls napi_setup_loader(env, loader_)
//        (quickjs napi_env.cc), exposing env.Loader().load on that global
//     -> LoadModule(napi_env.cc) calls napi_find_module("lynxtron_hello")
//        -> the NODE_API_MODULE macro (primjs quickjs napi.h) registers this
//           module (napi_module_register_xx(&_module)) into the global module
//           list from a static initializer
//     -> nm_register_func(env, exports) == NativeHelloInit returns exports
//
// This TU builds into lynxtron_lib (liblynxtron.so).  The static
// initializer registers the module into the primjs quickjs napi module list
// as soon as the library is loaded, so lynx.getModuleLoader().load() finds
// it without any explicit registration beforehand.

#include <string>

// Napi:: C++ wrapper of primjs quickjs (not weak-node-api; it carries no
// NAPI_CPP_CUSTOM_NAMESPACE).
#include "third_party/binding/napi/shim/shim_napi.h"

// shim_napi.h ends by including primjs_napi_undefs.h, which strips the
// *__primjs suffix back to the bare napi_module/napi_value/napi_env names.
// NODE_API_MODULE must therefore expand while the USE_PRIMJS_NAPI suffix
// mapping is active, or it would reference bare types that do not exist
// consistently; hence the suffix mapping is re-applied before the macro.
#ifdef USE_PRIMJS_NAPI
#include "third_party/napi/include/primjs_napi_defines.h"
#endif

namespace {

// hello(): returns "Hello from Lynxtron native module!".
Napi::Value Hello(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::String::New(env, "Hello from Lynxtron native module!");
}

// add(a, b): returns a + b as number; non-number arguments count as 0.
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

// echo(x): returns x unchanged; used to verify return-value type round trips.
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
