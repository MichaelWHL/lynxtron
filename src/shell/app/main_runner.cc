// Copyright (c) 2024 Lynxtron Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/app/main_runner.h"

#include "base/command_line.h"
#include "base/memory/ptr_util.h"
#include "base/run_loop.h"
#include "build/build_config.h"
#include "shell/app/main_parts.h"
#include "shell/app/uv_stdio_fix.h"

#if BUILDFLAG(IS_HARMONY)
#include <hilog/log.h>
#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x0000
#define LOG_TAG "LynxtronRun"
#define LYNX_LOG(fmt, ...) \
  OH_LOG_INFO(LOG_APP, "[MainRunner] " fmt, ##__VA_ARGS__)
#else
#define LYNX_LOG(fmt, ...) (void)0
#endif

#if BUILDFLAG(IS_MAC)
#include "base/apple/bundle_locations.h"
#include "shell/common/mac/main_application_bundle.h"
#endif

namespace lynxtron {

namespace {

void InitializePlatform() {
#if BUILDFLAG(IS_MAC)
  FixStdioStreams();
  base::apple::SetOverrideFrameworkBundlePath(
      lynxtron::MainApplicationBundlePath()
          .Append("Contents")
          .Append("Frameworks")
          .Append(LYNXTRON_PRODUCT_NAME " Framework.framework"));
#endif
}

}  // namespace

// static
std::unique_ptr<MainRunner> MainRunner::Create() {
  return base::WrapUnique(new MainRunner());
}

MainRunner::MainRunner() = default;

MainRunner::~MainRunner() = default;

int MainRunner::Initialize() {
  InitializePlatform();
  return 0;
}

int MainRunner::Run() {
  LYNX_LOG("creating MainParts...");
  main_parts_ = std::make_unique<MainParts>();
  LYNX_LOG("MainParts created, calling Initialize...");
  main_parts_->Initialize();
  LYNX_LOG("MainParts::Initialize done");

  {
    auto* cmd = base::CommandLine::ForCurrentProcess();
    LYNX_LOG("[PROBE] after JS init: hasSwitch(lynxtron-rw)=%{public}s "
             "value=\"%{public}s\"",
             cmd->HasSwitch("lynxtron-rw") ? "true" : "false",
             cmd->GetSwitchValueASCII("lynxtron-rw").c_str());
  }

  auto run_loop =
      std::make_unique<base::RunLoop>(base::RunLoop::Type::kDefault);
  LYNX_LOG("calling WillRunMainMessageLoop...");
  main_parts_->WillRunMainMessageLoop(run_loop);
  LYNX_LOG("entering run_loop->Run() (blocking event loop)...");
  run_loop->Run();
  LYNX_LOG("run_loop->Run() returned, calling PostMainMessageLoopRun");

  {
    auto* cmd = base::CommandLine::ForCurrentProcess();
    LYNX_LOG("[PROBE] after run loop: hasSwitch(lynxtron-rw)=%{public}s "
             "value=\"%{public}s\"",
             cmd->HasSwitch("lynxtron-rw") ? "true" : "false",
             cmd->GetSwitchValueASCII("lynxtron-rw").c_str());
  }

  main_parts_->PostMainMessageLoopRun();
  int code = main_parts_->GetExitCode();
  LYNX_LOG("MainRunner::Run returning code=%{public}d", code);
  return code;
}

void MainRunner::Shutdown() {
  main_parts_->Shutdown();
}

}  // namespace lynxtron
