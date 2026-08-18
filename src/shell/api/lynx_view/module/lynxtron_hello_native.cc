// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// 测试用例: 通过 getModuleLoader().load('lynxtron_hello') 从 JS 加载。
//
// 加载链路:
//   JS: lynx.getModuleLoader().load('lynxtron_hello')
//     -> lynx.ts getModuleLoader() 返回 nativeGlobal['napiLoaderOnRT'+nativeAppId]
//     -> NapiRuntimeProxy::SetupLoader() 里 napi_setup_loader(env, loader_)
//        (quickjs napi_env.cc) 把 env.Loader() 的 { load } 挂到对应全局名
//     -> LoadModule(napi_env.cc) 调 napi_find_module("lynxtron_hello")
//        -> NODE_API_MODULE 宏 (primjs quickjs napi.h) 在 static init 时把本模块
//           napi_module_register_xx(&_module) 注册进全局 modlist
//     -> nm_register_func(env, exports) == NativeHelloInit, 返回 exports
//
// 本 TU 编译进 lynxtron_lib (liblynxtron.so), static constructor 在进程启动时
// 自动把模块注册进 primjs quickjs napi 的全局模块链表, 因此 load() 前无需手动注册。

#include <string>

// primjs quickjs 的 Napi:: C++ 包装 (不是 weak-node-api, 不含 NAPI_CPP_CUSTOM_NAMESPACE)。
#include "third_party/binding/napi/shim/shim_napi.h"

// shim_napi.h 末尾会 #include primjs_napi_undefs.h, 把 napi_module/napi_value/napi_env
// 从 *__primjs 后缀还原成裸名。NODE_API_MODULE 宏必须在 USE_PRIMJS_NAPI 后缀激活时展开,
// 否则会引用到不存在/不一致的裸类型。故在宏展开前重新套用一次后缀映射。
#ifdef USE_PRIMJS_NAPI
#include "third_party/napi/include/primjs_napi_defines.h"
#endif

namespace {

// 无参: hello() -> "Hello from Lynxtron native module!"
Napi::Value Hello(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::String::New(env, "Hello from Lynxtron native module!");
}

// add(a, b) -> a + b (自动转 number, 非 number 返回 0)
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

// echo(x) -> x (原样返回, 用于验证返回值类型往返)
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
