// Copyright (c) 2013 GitHub, Inc.
// Use of this source code is governed by the MIT license that can be
// found in the LICENSE file.

// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/app/main_parts.h"

#include <string>
#include <utility>

#include "app/application.h"
#include "base/command_line.h"
#include "base/feature_list.h"
#include "base/path_service.h"
#include "base/power_monitor/power_monitor.h"
#include "base/power_monitor/power_monitor_device_source.h"
#include "base/run_loop.h"
#include "base/task/thread_pool/thread_pool_instance.h"
#include "base/threading/hang_watcher.h"
#include "build/build_config.h"
#include "gin/v8_initializer.h"
#include "main_parts_delegate.h"
#include "shell/api/lynx_view/lynx_view.h"
#include "shell/api/lynxtron_bindings.h"
#include "shell/app/icon_manager.h"
#include "shell/app/javascript_environment.h"
#include "shell/common/global_thread.h"
#include "shell/common/lynxtron_command_line.h"
#include "shell/common/lynxtron_paths.h"
#include "shell/common/node_bindings.h"
#include "shell/common/node_includes.h"
#include "shell/common/path_provider.h"

#if BUILDFLAG(IS_WIN)
#include "base/win/scoped_com_initializer.h"
#include "shell/ui/display/desktop_screen.h"
#endif

#if BUILDFLAG(IS_HARMONY)
#include <hilog/log.h>
#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x0000
#define LOG_TAG "LynxtronRun"
#define MP_LOG(fmt, ...) \
  OH_LOG_INFO(LOG_APP, "[MainParts] " fmt, ##__VA_ARGS__)
#else
#define MP_LOG(fmt, ...) (void)0
#endif

#if BUILDFLAG(IS_HARMONY)
extern "C" void LynxtronFlushPendingOpenURLs();
#endif

namespace lynxtron {

namespace {

void InitializeFeatureList() {
  // Initialize base::FeatureList with the command-line flags.
  auto feature_list = std::make_unique<base::FeatureList>();

  base::CommandLine* command_line = base::CommandLine::ForCurrentProcess();
  std::string enable_features =
      command_line->GetSwitchValueASCII("enable-features");
  std::string disable_features =
      command_line->GetSwitchValueASCII("disable-features");

  feature_list->InitFromCommandLine(enable_features, disable_features);
  base::FeatureList::SetInstance(std::move(feature_list));
}

}  // namespace

// static
MainParts* MainParts::self_ = nullptr;

MainParts::MainParts()
    : application_(std::make_unique<Application>()),
      node_bindings_(NodeBindings::Create()),
      lynxtron_bindings_{
          std::make_unique<LynxtronBindings>(node_bindings_->uv_loop())} {
  DCHECK(!self_) << "Cannot have two MainParts";
  self_ = this;

  // Create MainPartsDelegate if need
  auto& registry = GetGlobalDelegateRegistry();
  auto it = registry.find(kMainPartsDelegateName);
  if (it != registry.end()) {
    auto delegate = it->second.CreateDelegate();
    if (delegate) {
      main_parts_delegate_ = std::unique_ptr<MainPartsDelegate>(
          reinterpret_cast<MainPartsDelegate*>(delegate.release()));
    }
  } else {
    LOG(ERROR) << "MainPartsDelegate not found in registry.";
  }
}

MainParts::~MainParts() = default;

// static
MainParts* MainParts::Get() {
  DCHECK(self_);
  return self_;
}

bool MainParts::SetExitCode(int code) {
  if (!exit_code_) {
    return false;
  }

  *exit_code_ = code;
  return true;
}

int MainParts::GetExitCode() const {
  return exit_code_.value_or(0);
}

void MainParts::Initialize() {
  MP_LOG("step 0: entered");
  if (main_parts_delegate_) {
    MP_LOG("step 1: PreInitialization delegate");
    main_parts_delegate_->PreInitialization();
  }

  MP_LOG("step 2: FeatureList::ClearInstanceForTesting");
  base::FeatureList::ClearInstanceForTesting();

#if BUILDFLAG(IS_WIN)
  com_initializer_ = std::make_unique<base::win::ScopedCOMInitializer>();
#endif

  MP_LOG("step 3: InitializeFeatureList");
  InitializeFeatureList();

  MP_LOG("step 4: HangWatcher::InitializeOnMainThread");
  base::HangWatcher::InitializeOnMainThread(
      base::HangWatcher::ProcessType::kBrowserProcess,
      /*emit_crashes=*/true);

  if (base::HangWatcher::IsEnabled()) {
    MP_LOG("step 4b: HangWatcher enabled, creating instance");
    base::HangWatcher::CreateHangWatcherInstance();
    hang_watcher_unregister_thread_closure_ = base::HangWatcher::RegisterThread(
        base::HangWatcher::ThreadType::kMainThread);
    base::HangWatcher::GetInstance()->Start();
  }

  MP_LOG("step 5: ThreadPoolInstance::CreateAndStartWithDefaultParams");
  base::ThreadPoolInstance::CreateAndStartWithDefaultParams("lynxtron");
#if BUILDFLAG(IS_MAC)
  RegisterAtomCrApp();
  scoped_native_screen_ = std::make_unique<display::ScopedNativeScreen>();
#endif
  MP_LOG("step 6: PathService::RegisterProvider");
  base::PathService::RegisterProvider(PathProvider, PATH_START, PATH_END);

  MP_LOG("step 7: creating GlobalThread");
  global_thread_ = std::make_unique<GlobalThread>();

  MP_LOG("step 8: V8Initializer::LoadV8Snapshot");
  gin::V8Initializer::LoadV8Snapshot(gin::V8SnapshotFileType::kDefault);

  MP_LOG("step 9: creating JavascriptEnvironment "
         "(node_bindings_->uv_loop())");
  js_env_ = std::make_unique<JavascriptEnvironment>(node_bindings_->uv_loop());
  MP_LOG("step 9 done");

  v8::Isolate* const isolate = js_env_->isolate();
  v8::HandleScope scope(isolate);
  if (main_parts_delegate_) {
    MP_LOG("step 10: PostV8Initialization delegate");
    main_parts_delegate_->PostV8Initialization();
  }
  MP_LOG("step 11: node_bindings_->Initialize");
  node_bindings_->Initialize(isolate, isolate->GetCurrentContext());

  MP_LOG("step 12: node_bindings_->CreateEnvironment");
  node_env_ = node_bindings_->CreateEnvironment(
      isolate, isolate->GetCurrentContext(), js_env_->platform(),
      js_env_->max_young_generation_size_in_bytes());

  MP_LOG("step 13: configuring node_env");
  node_env_->set_trace_sync_io(node_env_->options()->trace_sync_io);
  node_env_->options()->unhandled_rejections = "warn-with-error-code";

  MP_LOG("step 14: lynxtron_bindings_->BindTo");
  lynxtron_bindings_->BindTo(isolate, node_env_->process_object());

  MP_LOG("step 15: CreateMicrotasksRunner");
  js_env_->CreateMicrotasksRunner();

  MP_LOG("step 16: node_bindings_->set_uv_env");
  node_bindings_->set_uv_env(node_env_.get());

  MP_LOG("step 17: node_bindings_->LoadEnvironment");
  node_bindings_->LoadEnvironment(node_env_.get());

  MP_LOG("step 18: node_bindings_->JoinAppCode");
  node_bindings_->JoinAppCode();

  MP_LOG("step 19: LynxView::SetNodePlatformEnv");
  LynxView::SetNodePlatformEnv(js_env_->platform());

#if BUILDFLAG(IS_WIN)
  if (!display::Screen::Get()) {
    screen_ = views::CreateDesktopScreen();
  }
#endif

  MP_LOG("step 20: PowerMonitor::Initialize");
  base::PowerMonitor::GetInstance()->Initialize(
      std::make_unique<base::PowerMonitorDeviceSource>());

  if (main_parts_delegate_) {
    MP_LOG("step 21: PostInitialization delegate");
    main_parts_delegate_->PostInitialization();
  }

#if BUILDFLAG(IS_MAC)
  InitializeMacMainMessageLoop();
#endif

  MP_LOG("step 22: node_bindings_->PrepareEmbedThread");
  node_bindings_->PrepareEmbedThread();
  MP_LOG("step 23: node_bindings_->StartPolling");
  node_bindings_->StartPolling();

#if !BUILDFLAG(IS_MAC)
  MP_LOG("step 24: Application::WillFinishLaunching");
  Application::Get()->WillFinishLaunching();
  MP_LOG("step 25: Application::DidFinishLaunching");
  Application::Get()->DidFinishLaunching(base::Value::Dict());
#endif

  MP_LOG("step 26: Application::PreMainMessageLoopRun");
  Application::Get()->PreMainMessageLoopRun();

#if BUILDFLAG(IS_HARMONY)
  LynxtronFlushPendingOpenURLs();
#endif

  MP_LOG("step 27: Initialize finished");
}

void MainParts::WillRunMainMessageLoop(
    std::unique_ptr<base::RunLoop>& run_loop) {
  exit_code_ = 0;
  // js_env_->OnMessageLoopCreated();
  Application::Get()->SetMainMessageLoopQuitClosure(
      run_loop->QuitWhenIdleClosure());
#if !BUILDFLAG(IS_WIN)
  InstallShutdownSignalHandlers(
      base::BindOnce(&Application::Quit, base::Unretained(Application::Get())),
      GetUIThreadTaskRunner());
#endif
}

void MainParts::PostMainMessageLoopRun() {
  // Destroy node platform after all destructors_ are executed, as they may
  // invoke Node/V8 APIs inside them.
  node_env_->set_trace_sync_io(false);
  js_env_->DestroyMicrotasksRunner();
  node::Stop(node_env_.get(), node::StopFlags::kDoNotTerminateIsolate);
  node_bindings_->set_uv_env(nullptr);
  node_env_.reset();
}

void MainParts::Shutdown() {
  if (main_parts_delegate_) {
    main_parts_delegate_->PreShutdown();
  }
  global_thread_.reset();
  base::ThreadPoolInstance::Get()->Shutdown();

#if BUILDFLAG(IS_WIN)
  screen_.reset();
  com_initializer_.reset();
#endif
}

IconManager* MainParts::GetIconManager() {
  if (!icon_manager_) {
    icon_manager_ = std::make_unique<IconManager>();
  }
  return icon_manager_.get();
}

}  // namespace lynxtron
