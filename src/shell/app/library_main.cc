// Copyright 2025 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/app/library_main.h"

#include <memory>
#include <string>

#include "base/at_exit.h"
#include "base/command_line.h"
#include "base/environment.h"
#include "base/files/file_enumerator.h"
#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/i18n/icu_util.h"
#include "base/path_service.h"
#include "build/buildflag.h"
#include <errno.h>   // lynxtron: stdio redirect errno
#include <stdio.h>   // lynxtron: freopen/setvbuf
#include <stdlib.h>  // lynxtron: setenv

#if BUILDFLAG(IS_HARMONY)
#include <hilog/log.h>
#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x0000
#define LOG_TAG "LynxtronMain"
#define LYNX_LOG(fmt, ...) \
  OH_LOG_INFO(LOG_APP, "[LynxtronMain] " fmt, ##__VA_ARGS__)
#define LYNX_ERR(fmt, ...) \
  OH_LOG_ERROR(LOG_APP, "[LynxtronMain] " fmt, ##__VA_ARGS__)
#else
#define LYNX_LOG(fmt, ...) (void)0
#define LYNX_ERR(fmt, ...) (void)0
#endif
#if defined(ADDRESS_SANITIZER)
#include "base/debug/asan_service.h"
#endif
#include "shell/app/main_runner.h"
#include "shell/app/relauncher.h"
#include "shell/common/fuses.h"
#include "shell/common/logging.h"
#include "shell/common/lynxtron_command_line.h"

#if !defined(OFFICIAL_BUILD)
#include "base/debug/debugger.h"
#include "base/debug/stack_trace.h"
#endif

#if BUILDFLAG(IS_WIN)
#include <windows.h>

#include <shellapi.h>

#include "base/functional/bind.h"
#include "shell/app/application.h"
#include "shell/common/global_thread.h"

void HandleConsoleControlEventOnUIThread(DWORD control_type) {
  if (lynxtron::Application::Get()) {
    lynxtron::Application::Get()->Quit();
  }
}

BOOL WINAPI ConsoleControlHandler(DWORD control_type) {
  // Delegate session handling on the main thread and hangs the control thread.
  lynxtron::GlobalThread::GetUIThreadTaskRunner()->PostTask(
      FROM_HERE,
      base::BindOnce(&HandleConsoleControlEventOnUIThread, control_type));
  return TRUE;
}

void InstallConsoleControlHandler() {
  if (!::SetConsoleCtrlHandler(&ConsoleControlHandler, /*Add=*/TRUE)) {
    DLOG(ERROR) << "Failed to install console control handler";
  }
}
#endif

#if BUILDFLAG(IS_MAC)
#endif

const char kProcessType[] = "type";

#include "shell/app/node_main.h"
#include "shell/common/process_type_registry.h"

namespace {

constexpr char kRunAsNodeEnv[] = "LYNXTRON_RUN_AS_NODE";

bool IsRunAsNode() {
  auto env = base::Environment::Create();
  return lynxtron::fuses::IsRunAsNodeEnabled() && env->HasVar(kRunAsNodeEnv);
}

}  // namespace

#if BUILDFLAG(IS_WIN)
int LynxtronMain() {
#else
int LynxtronMain(int argc, char* argv[]) {
#endif
  LYNX_LOG(">>> entered, argc=%{public}d", argc);

#if BUILDFLAG(IS_HARMONY)
  // HAP apps discard stdout/stderr — redirect to a file so Node.js JS
  // errors (bootstrap failures, uncaught exceptions before exit) are
  // captured. Pull with:
  //   hdc file recv /data/app/el2/100/base/com.huawei.electron/files/lynxtron-stdio.log
  {
    const char* kStdioLog = "/data/local/tmp/lynxtron-stdio.log";
    FILE* f = freopen(kStdioLog, "w", stderr);
    if (f) {
      setvbuf(stderr, nullptr, _IONBF, 0);
      // Also mirror stdout into the same file.
      if (freopen(kStdioLog, "a", stdout)) setvbuf(stdout, nullptr, _IONBF, 0);
      LYNX_LOG("stdio redirected to %{public}s", kStdioLog);
    } else {
      LYNX_ERR("stdio redirect FAILED errno=%{public}d", errno);
    }
  }
#endif

  base::AtExitManager exit_manager;
  LYNX_LOG("AtExitManager created");

#if defined(ADDRESS_SANITIZER)
  base::debug::AsanService::GetInstance()->Initialize();
  LYNX_LOG("ASan initialized");
#endif

#if BUILDFLAG(IS_WIN)
  InstallConsoleControlHandler();
  {
    int argc = 0;
    wchar_t** argv = ::CommandLineToArgvW(::GetCommandLineW(), &argc);
    if (!argv) {
      return -1;
    }
    base::CommandLine::Init(0, nullptr);
    lynxtron::LynxtronCommandLine::Init(argc, argv);
    LocalFree(argv);
  }
#else
  LYNX_LOG("calling base::CommandLine::Init...");
  base::CommandLine::Init(argc, argv);
  LYNX_LOG("base::CommandLine::Init done");

  LYNX_LOG("calling LynxtronCommandLine::Init...");
  lynxtron::LynxtronCommandLine::Init(argc, argv);
  LYNX_LOG("LynxtronCommandLine::Init done");
#endif

  LYNX_LOG("calling InitLogging...");
  lynxtron::InitLogging(*base::CommandLine::ForCurrentProcess(),
                        /* is_preinit = */ true);
  LYNX_LOG("InitLogging done");

#if BUILDFLAG(IS_HARMONY)
  // HAP resfile is mounted at one of these paths depending on HarmonyOS
  // version + sandbox config. Probe to find which one actually contains our
  // staged icudtl.dat, then Override DIR_ASSETS to that directory.
  {
    const char* kCandidatePaths[] = {
        "/data/storage/el1/bundle/resources/resfile",
        "/data/storage/el1/bundle/entry/resources/resfile",
        "/data/storage/el2/base/resources/resfile",
        "/data/storage/el1/base/resources/resfile",
    };
    const char* chosen = nullptr;
    for (const char* p : kCandidatePaths) {
      base::FilePath f =
          base::FilePath(p).AppendASCII("icudtl.dat");
      bool exists = base::PathExists(f);
      LYNX_LOG("probe \"%{public}s\" exists=%{public}s",
               f.value().c_str(), exists ? "YES" : "no");
      if (exists && !chosen) chosen = p;
    }
    if (chosen) {
      base::FilePath assets(chosen);
      bool ok = base::PathService::Override(base::DIR_ASSETS, assets);
      LYNX_LOG("Override(DIR_ASSETS, \"%{public}s\") = %{public}s",
               assets.value().c_str(), ok ? "true" : "false");
    } else {
      LYNX_ERR("icudtl.dat not found at any candidate path — "
               "ICU will crash. Listing /data/storage/el1/bundle/ ...");
      base::FileEnumerator e(
          base::FilePath("/data/storage/el1/bundle"), true,
          base::FileEnumerator::FILES, FILE_PATH_LITERAL("icudtl.dat"));
      for (auto p = e.Next(); !p.empty(); p = e.Next()) {
        LYNX_LOG("FOUND icudtl.dat at: %{public}s", p.value().c_str());
      }
    }
  }
#endif

#if BUILDFLAG(IS_HARMONY)
  // Probe the asar file with raw C++ reads (no asar fs hook) to check
  // whether the HAP-installed file content is intact.
  {
    const char* kAsar =
        "/data/storage/el1/bundle/entry/resources/resfile/resources/"
        "default_app.asar";
    std::string head;
    if (base::ReadFileToStringWithMaxSize(base::FilePath(kAsar), &head, 32) ||
        head.size() > 0) {
      std::string hex;
      for (unsigned char c : head) {
        char b[4];
        snprintf(b, sizeof(b), "%02x", c);
        hex += b;
      }
      std::optional<int64_t> fsize =
          base::GetFileSize(base::FilePath(kAsar));
      LYNX_LOG("asar probe size=%{public}lld head=%{public}s",
               fsize ? static_cast<long long>(*fsize) : -1LL, hex.c_str());
    } else {
      LYNX_ERR("asar probe: cannot read %{public}s", kAsar);
    }
  }
#endif

  LYNX_LOG("calling base::i18n::InitializeICU...");
  bool icu_ok = base::i18n::InitializeICU();
  LYNX_LOG("InitializeICU returned %{public}s", icu_ok ? "true" : "false");
  if (!icu_ok) {
    LYNX_ERR("ICU init FAILED — this will likely cause crashes");
  }

#if !defined(OFFICIAL_BUILD)
  LYNX_LOG("calling EnableInProcessStackDumping...");
  base::debug::EnableInProcessStackDumping();
  LYNX_LOG("calling VerifyDebugger...");
  base::debug::VerifyDebugger();
  LYNX_LOG("debug setup done");
#endif

  if (IsRunAsNode()) {
    LYNX_LOG("LYNXTRON_RUN_AS_NODE is set — entering RunNodeMain");
    return lynxtron::RunNodeMain();
  }

  base::CommandLine* command_line = base::CommandLine::ForCurrentProcess();
  constexpr char kRelauncherProcess[] = "relauncher";
  const std::string process_type =
      command_line->GetSwitchValueASCII(kProcessType);
  LYNX_LOG("process_type = \"%{public}s\"", process_type.c_str());

  if (process_type == kRelauncherProcess) {
    LYNX_LOG("entering RelauncherMain");
    return relauncher::RelauncherMain();
  }

  if (!process_type.empty()) {
    auto& registry = lynxtron::GetProcessTypeRegistry();
    auto it = registry.find(process_type);
    if (it != registry.end()) {
      LYNX_LOG("found registered handler for process_type, running it");
      return it->second.Run(*command_line);
    }
    LYNX_ERR("unknown process_type \"%{public}s\" — no handler registered",
             process_type.c_str());
  }

  LYNX_LOG("creating MainRunner...");
  auto runner = lynxtron::MainRunner::Create();
  LYNX_LOG("MainRunner created, calling Initialize...");

  int exit_code = runner->Initialize();
  LYNX_LOG("MainRunner::Initialize returned %{public}d", exit_code);

  if (exit_code == 0) {
    LYNX_LOG("calling MainRunner::Run...");
    exit_code = runner->Run();
    LYNX_LOG("MainRunner::Run returned %{public}d", exit_code);
  } else {
    LYNX_ERR("MainRunner::Initialize FAILED with code %{public}d, skipping Run",
             exit_code);
  }

  LYNX_LOG("calling MainRunner::Shutdown...");
  runner->Shutdown();
  LYNX_LOG("<<< exiting with code %{public}d", exit_code);
  return exit_code;
}
