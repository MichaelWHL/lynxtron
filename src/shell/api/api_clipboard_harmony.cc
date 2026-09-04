// Copyright 2026 The Lynxtron Authors. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// HarmonyOS clipboard implementation.
//
// The platform functions below are the harmony-side definitions of the
// clipboard API surface declared in api_clipboard.h (the JS binding in
// api_clipboard.cc calls them).  System-pasteboard access lives in ArkTS
// (ClipboardBridge.ets) so that user-grant permission requests and the
// @ohos.pasteboard service run on the ETS main thread; this file only
// dispatches a request across the bridge and blocks until ArkTS resolves it.
//
// Scope: only ReadText / WriteText are wired up.  Every other operation is
// reported as unsupported (a deliberate port limitation, not a placeholder):
// it logs an error and returns a default value so callers never mistake a
// missing implementation for a successful one.

#include "shell/api/api_clipboard.h"

#include <hilog/log.h>

#include <chrono>
#include <future>
#include <string>
#include <vector>

namespace lynxtron::api::clipboard {

namespace {

// Result callback invoked by the NAPI bridge when ArkTS resolves a request.
// user_data is a std::promise<std::string>* created by CallBridgeSync; the
// string payload is the resolved text (readText) or a status code (writeText).
using ClipboardResultCallback = void (*)(void* user_data, const char* result);

// Handler injected by the NAPI bridge via LynxtronSetClipboardHandler.  It
// dispatches (op, payload) to ArkTS through a thread-safe function and
// returns immediately; the result arrives later through ClipboardResultCallback.
using ClipboardBridgeHandler = void (*)(const char* op, const char* payload,
                                        ClipboardResultCallback callback,
                                        void* user_data);

ClipboardBridgeHandler g_clipboard_handler = nullptr;

// Completes the promise a blocked caller is waiting on.
void OnClipboardResult(void* user_data, const char* result) {
  auto* promise = static_cast<std::promise<std::string>*>(user_data);
  promise->set_value(result ? result : "");
}

// Dispatch (op, payload) to ArkTS and block the calling thread until the
// result arrives or the timeout expires.  The calling thread is the JS
// (Node) thread; ArkTS runs on the ETS main thread, so this wait cannot
// deadlock.  A timeout or a missing handler is logged and yields an empty
// result so a blocked clipboard call can never hang the JS thread.
std::string CallBridgeSync(const char* op, const char* payload) {
  if (!g_clipboard_handler) {
    OH_LOG_ERROR(LOG_APP, "[Clipboard] bridge not registered, op=%{public}s", op);
    return {};
  }
  std::promise<std::string> promise;
  auto future = promise.get_future();
  g_clipboard_handler(op, payload, &OnClipboardResult, &promise);
  if (future.wait_for(std::chrono::seconds(5)) != std::future_status::ready) {
    OH_LOG_ERROR(LOG_APP, "[Clipboard] op=%{public}s timed out", op);
    return {};
  }
  return future.get();
}

}  // namespace

// Injected by the NAPI bridge at startup so this translation unit can reach
// ArkTS.  Kept extern "C" so the symbol is discoverable via dlsym.
extern "C" __attribute__((visibility("default"))) void
LynxtronSetClipboardHandler(ClipboardBridgeHandler handler) {
  g_clipboard_handler = handler;
}

std::string ReadText() {
  return CallBridgeSync("readText", "");
}

void WriteText(const std::string& text) {
  // Write failures are reported on the ArkTS side; nothing further to do.
  CallBridgeSync("writeText", text.c_str());
}

// ---------------------------------------------------------------------------
// Unsupported operations (only readText / writeText are provided on HarmonyOS).
// Each logs an error so a call is visible rather than silently fake.
// ---------------------------------------------------------------------------

std::vector<std::string> AvailableFormats() {
  OH_LOG_ERROR(LOG_APP,
               "[Clipboard] AvailableFormats is not supported by the HarmonyOS port");
  return {};
}

void Clear() {
  OH_LOG_ERROR(LOG_APP,
               "[Clipboard] Clear is not supported by the HarmonyOS port");
}

std::string ReadHTML() {
  OH_LOG_ERROR(LOG_APP,
               "[Clipboard] ReadHTML is not supported by the HarmonyOS port");
  return {};
}

gfx::Image ReadImage() {
  OH_LOG_ERROR(LOG_APP,
               "[Clipboard] ReadImage is not supported by the HarmonyOS port");
  return {};
}

void Write(const ClipboardData& data) {
  OH_LOG_ERROR(LOG_APP,
               "[Clipboard] Write is not supported by the HarmonyOS port");
}

void WriteHTML(const std::string& markup) {
  OH_LOG_ERROR(LOG_APP,
               "[Clipboard] WriteHTML is not supported by the HarmonyOS port");
}

void WriteImage(const gfx::Image& image) {
  OH_LOG_ERROR(LOG_APP,
               "[Clipboard] WriteImage is not supported by the HarmonyOS port");
}

}  // namespace lynxtron::api::clipboard
