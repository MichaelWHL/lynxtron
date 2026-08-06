// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Native bindings for lynxtron.checkAppUpdate(), lynxtron.showUpdateDialog(),
// and lynxtron.loadProduct().
//
// Each function returns a JS Promise. On HarmonyOS, the request is forwarded
// to ArkTS via cross-library flags; the NAPI bridge (liblynxtron_napi.so)
// polls these flags, runs the real @kit.AppGalleryKit APIs, and reports the
// results back through the dlsym'd resolve functions below.
//
// On non-HarmonyOS, Promises are rejected immediately.

#include "shell/api/api_update_check.h"

#include <atomic>
#include <mutex>
#include <string>

#include "base/logging.h"
#include "shell/common/gin_helper/dictionary.h"
#include "shell/common/node_includes.h"

#define ZYBAPI_TAG "[zybapi] "

// ---- Shared state ----

// checkAppUpdate
static std::atomic<bool> g_check_app_update_pending{false};
static std::mutex g_check_mutex;
static v8::Isolate* g_check_isolate = nullptr;
static v8::Persistent<v8::Promise::Resolver>* g_check_resolver = nullptr;

// showUpdateDialog
static std::atomic<bool> g_show_dialog_pending{false};
static std::mutex g_dialog_mutex;
static v8::Isolate* g_dialog_isolate = nullptr;
static v8::Persistent<v8::Promise::Resolver>* g_dialog_resolver = nullptr;

// loadProduct
static std::atomic<bool> g_load_product_pending{false};
static std::mutex g_product_mutex;
static std::string g_product_params_json;
static v8::Isolate* g_product_isolate = nullptr;
static v8::Persistent<v8::Promise::Resolver>* g_product_resolver = nullptr;

// ---- Helpers ----

static void ClearResolver(v8::Persistent<v8::Promise::Resolver>** r,
                          v8::Isolate** iso) {
  if (*r) {
    (*r)->Reset();
    delete *r;
    *r = nullptr;
  }
  *iso = nullptr;
}

// ---- extern "C" exports (dlsym'd by NAPI bridge) ----

extern "C" {

bool LynxtronConsumeCheckAppUpdateRequest() {
  bool pending = g_check_app_update_pending.exchange(false);
  LOG(INFO) << ZYBAPI_TAG << "ConsumeCheckAppUpdateRequest pending=" << pending;
  return pending;
}

void LynxtronResolveCheckAppUpdate(const char* json) {
  LOG(INFO) << ZYBAPI_TAG << "ResolveCheckAppUpdate json=" << (json ? json : "null");
  std::lock_guard<std::mutex> lock(g_check_mutex);
  if (!g_check_isolate || !g_check_resolver || !json) {
    LOG(INFO) << ZYBAPI_TAG << "ResolveCheckAppUpdate skipped: no resolver";
    return;
  }
  v8::Isolate* isolate = g_check_isolate;
  v8::HandleScope hs(isolate);
  v8::Local<v8::Context> ctx = isolate->GetCurrentContext();
  v8::Context::Scope cs(ctx);
  v8::Local<v8::Promise::Resolver> r =
      v8::Local<v8::Promise::Resolver>::New(isolate, *g_check_resolver);
  v8::Local<v8::String> v = v8::String::NewFromUtf8(isolate, json).ToLocalChecked();
  v8::Local<v8::Value> parsed;
  if (v8::JSON::Parse(ctx, v).ToLocal(&parsed)) {
    r->Resolve(ctx, parsed).Check();
  } else {
    r->Resolve(ctx, v).Check();
  }
  ClearResolver(&g_check_resolver, &g_check_isolate);
  LOG(INFO) << ZYBAPI_TAG << "ResolveCheckAppUpdate done";
}

bool LynxtronConsumeShowUpdateDialogRequest() {
  bool pending = g_show_dialog_pending.exchange(false);
  LOG(INFO) << ZYBAPI_TAG << "ConsumeShowUpdateDialogRequest pending=" << pending;
  return pending;
}

void LynxtronResolveShowUpdateDialog(int result_code) {
  LOG(INFO) << ZYBAPI_TAG << "ResolveShowUpdateDialog result_code=" << result_code;
  std::lock_guard<std::mutex> lock(g_dialog_mutex);
  if (!g_dialog_isolate || !g_dialog_resolver) {
    LOG(INFO) << ZYBAPI_TAG << "ResolveShowUpdateDialog skipped: no resolver";
    return;
  }
  v8::Isolate* isolate = g_dialog_isolate;
  v8::HandleScope hs(isolate);
  v8::Local<v8::Context> ctx = isolate->GetCurrentContext();
  v8::Context::Scope cs(ctx);
  v8::Local<v8::Promise::Resolver> r =
      v8::Local<v8::Promise::Resolver>::New(isolate, *g_dialog_resolver);
  r->Resolve(ctx, v8::Integer::New(isolate, result_code)).Check();
  ClearResolver(&g_dialog_resolver, &g_dialog_isolate);
}

const char* LynxtronConsumeLoadProductParams() {
  std::lock_guard<std::mutex> lock(g_product_mutex);
  if (!g_load_product_pending.load()) return nullptr;
  g_load_product_pending.store(false);
  // Transfer ownership: caller gets the string, we clear ours.
  static thread_local std::string copy;
  copy = std::move(g_product_params_json);
  g_product_params_json.clear();
  return copy.empty() ? nullptr : copy.c_str();
}

void LynxtronResolveLoadProduct(const char* json) {
  std::lock_guard<std::mutex> lock(g_product_mutex);
  if (!g_product_isolate || !g_product_resolver || !json) return;
  v8::Isolate* isolate = g_product_isolate;
  v8::HandleScope hs(isolate);
  v8::Local<v8::Context> ctx = isolate->GetCurrentContext();
  v8::Context::Scope cs(ctx);
  v8::Local<v8::Promise::Resolver> r =
      v8::Local<v8::Promise::Resolver>::New(isolate, *g_product_resolver);
  v8::Local<v8::String> v = v8::String::NewFromUtf8(isolate, json).ToLocalChecked();
  v8::Local<v8::Value> parsed;
  if (v8::JSON::Parse(ctx, v).ToLocal(&parsed)) {
    r->Resolve(ctx, parsed).Check();
  } else {
    r->Resolve(ctx, v).Check();
  }
  ClearResolver(&g_product_resolver, &g_product_isolate);
}

}  // extern "C"

// ---- Node.js linked binding ----

namespace {

v8::Local<v8::Value> CheckAppUpdate(v8::Isolate* isolate) {
#if !BUILDFLAG(IS_HARMONY)
  auto resolver = v8::Promise::Resolver::New(isolate->GetCurrentContext()).ToLocalChecked();
  resolver->Reject(isolate->GetCurrentContext(),
                   v8::Exception::Error(v8::String::NewFromUtf8(isolate,
                       "checkAppUpdate is only supported on HarmonyOS").ToLocalChecked())).Check();
  return resolver->GetPromise();
#else
  v8::Local<v8::Context> ctx = isolate->GetCurrentContext();
  auto resolver = v8::Promise::Resolver::New(ctx).ToLocalChecked();
  {
    std::lock_guard<std::mutex> lock(g_check_mutex);
    ClearResolver(&g_check_resolver, &g_check_isolate);
    g_check_isolate = isolate;
    g_check_resolver = new v8::Persistent<v8::Promise::Resolver>();
    g_check_resolver->Reset(isolate, resolver);
  }
  g_check_app_update_pending.store(true);
  LOG(INFO) << ZYBAPI_TAG << "CheckAppUpdate request flag set";
  return resolver->GetPromise();
#endif
}

v8::Local<v8::Value> ShowUpdateDialog(v8::Isolate* isolate) {
#if !BUILDFLAG(IS_HARMONY)
  auto resolver = v8::Promise::Resolver::New(isolate->GetCurrentContext()).ToLocalChecked();
  resolver->Reject(isolate->GetCurrentContext(),
                   v8::Exception::Error(v8::String::NewFromUtf8(isolate,
                       "showUpdateDialog is only supported on HarmonyOS").ToLocalChecked())).Check();
  return resolver->GetPromise();
#else
  v8::Local<v8::Context> ctx = isolate->GetCurrentContext();
  auto resolver = v8::Promise::Resolver::New(ctx).ToLocalChecked();
  {
    std::lock_guard<std::mutex> lock(g_dialog_mutex);
    ClearResolver(&g_dialog_resolver, &g_dialog_isolate);
    g_dialog_isolate = isolate;
    g_dialog_resolver = new v8::Persistent<v8::Promise::Resolver>();
    g_dialog_resolver->Reset(isolate, resolver);
  }
  g_show_dialog_pending.store(true);
  LOG(INFO) << ZYBAPI_TAG << "ShowUpdateDialog request flag set";
  return resolver->GetPromise();
#endif
}

v8::Local<v8::Value> LoadProduct(v8::Isolate* isolate,
                                  const std::string& params_json) {
#if !BUILDFLAG(IS_HARMONY)
  auto resolver = v8::Promise::Resolver::New(isolate->GetCurrentContext()).ToLocalChecked();
  resolver->Reject(isolate->GetCurrentContext(),
                   v8::Exception::Error(v8::String::NewFromUtf8(isolate,
                       "loadProduct is only supported on HarmonyOS").ToLocalChecked())).Check();
  return resolver->GetPromise();
#else
  v8::Local<v8::Context> ctx = isolate->GetCurrentContext();
  auto resolver = v8::Promise::Resolver::New(ctx).ToLocalChecked();
  {
    std::lock_guard<std::mutex> lock(g_product_mutex);
    ClearResolver(&g_product_resolver, &g_product_isolate);
    g_product_isolate = isolate;
    g_product_resolver = new v8::Persistent<v8::Promise::Resolver>();
    g_product_resolver->Reset(isolate, resolver);
    g_product_params_json = params_json;
  }
  g_load_product_pending.store(true);
  LOG(INFO) << ZYBAPI_TAG << "LoadProduct request flag set, params=" << params_json;
  return resolver->GetPromise();
#endif
}

void Initialize(v8::Local<v8::Object> exports,
                v8::Local<v8::Value> /*unused*/,
                v8::Local<v8::Context> context,
                void* /*priv*/) {
  v8::Isolate* isolate = context->GetIsolate();
  gin_helper::Dictionary dict(isolate, exports);
  dict.SetMethod("checkAppUpdate", &CheckAppUpdate);
  dict.SetMethod("showUpdateDialog", &ShowUpdateDialog);
  dict.SetMethod("loadProduct", &LoadProduct);
  LOG(INFO) << ZYBAPI_TAG << "Initialize: checkAppUpdate, showUpdateDialog, loadProduct registered";
}

}  // namespace

NODE_LINKED_BINDING_CONTEXT_AWARE(lynxtron_binding_update_check, Initialize)
