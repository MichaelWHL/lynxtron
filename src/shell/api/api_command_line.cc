// Copyright (c) 2019 GitHub, Inc.
// Use of this source code is governed by the MIT license that can be
// found in the LICENSE file.

// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include <string>

#include "base/command_line.h"
#include "base/strings/string_util.h"
#include "build/build_config.h"
#include "shell/common/gin_helper/dictionary.h"
#include "shell/common/node_includes.h"

#if BUILDFLAG(IS_HARMONY)
#include <hilog/log.h>
#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x0000
#define LOG_TAG "LynxtronRun"
#define CMD_LOG(fmt, ...) \
  OH_LOG_INFO(LOG_APP, "[CmdLine] " fmt, ##__VA_ARGS__)
#else
#define CMD_LOG(fmt, ...) (void)0
#endif

#if BUILDFLAG(IS_WIN)
#include "base/strings/utf_string_conversions.h"
#endif

namespace {
bool HasSwitch(const std::string& switch_string) {
  auto switch_str = base::ToLowerASCII(switch_string);

  auto* command_line = base::CommandLine::ForCurrentProcess();
  return command_line->HasSwitch(switch_str);
}

base::CommandLine::StringType GetSwitchValue(gin_helper::ErrorThrower thrower,
                                             const std::string& switch_string) {
  auto switch_str = base::ToLowerASCII(switch_string);

  auto* command_line = base::CommandLine::ForCurrentProcess();
  return command_line->GetSwitchValueNative(switch_str);
}

void AppendSwitch(const std::string& switch_string,
                  gin_helper::Arguments* args) {
  auto switch_str = base::ToLowerASCII(switch_string);
  auto* command_line = base::CommandLine::ForCurrentProcess();

  base::CommandLine::StringType value;
  if (args->GetNext(&value)) {
    command_line->AppendSwitchNative(switch_str, value);
    std::string value_utf8;
#if BUILDFLAG(IS_WIN)
    value_utf8 = base::WideToUTF8(value);
#else
    value_utf8 = value;
#endif
    CMD_LOG("[PROBE] appendSwitch received: %{public}s value=%{public}s",
            switch_str.c_str(), value_utf8.c_str());
  } else {
    command_line->AppendSwitch(switch_str);
    CMD_LOG("[PROBE] appendSwitch received: %{public}s (no value)",
            switch_str.c_str());
  }
}

void RemoveSwitch(const std::string& switch_string) {
  auto switch_str = base::ToLowerASCII(switch_string);

  auto* command_line = base::CommandLine::ForCurrentProcess();
  command_line->RemoveSwitch(switch_str);
}

void AppendArg(const std::string& arg) {
  auto* command_line = base::CommandLine::ForCurrentProcess();
  command_line->AppendArg(arg);
}

void Initialize(v8::Local<v8::Object> exports,
                v8::Local<v8::Value> unused,
                v8::Local<v8::Context> context,
                void* priv) {
  v8::Isolate* const isolate = v8::Isolate::GetCurrent();
  gin_helper::Dictionary dict{isolate, exports};
  dict.SetMethod("hasSwitch", &HasSwitch);
  dict.SetMethod("getSwitchValue", &GetSwitchValue);
  dict.SetMethod("appendSwitch", &AppendSwitch);
  dict.SetMethod("removeSwitch", &RemoveSwitch);
  dict.SetMethod("appendArgument", &AppendArg);
}

}  // namespace

NODE_LINKED_BINDING_CONTEXT_AWARE(lynxtron_binding_command_line, Initialize)
