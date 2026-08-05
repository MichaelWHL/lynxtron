// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/app/lynx_bringup_harmony.h"

#include <hilog/log.h>

#include <chrono>
#include <memory>
#include <mutex>
#include <thread>

#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/path_service.h"
#include "base/task/single_thread_task_runner.h"
#include "shell/api/lynx_view/lynx_view.h"
#include "shell/api/lynx_view/lynx_view_builder.h"
#include "shell/common/global_thread.h"

#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x0000
#define LOG_TAG "LynxtronBringup"
#define BU_LOG(fmt, ...) OH_LOG_INFO(LOG_APP, "[Bringup] " fmt, ##__VA_ARGS__)
#define BU_ERR(fmt, ...) OH_LOG_ERROR(LOG_APP, "[Bringup] " fmt, ##__VA_ARGS__)

namespace lynxtron {

namespace {

// Owns the bring-up LynxView. Only touched on the UI thread.
std::unique_ptr<LynxView>& BringupView() {
  static std::unique_ptr<LynxView> view;
  return view;
}

// Runs on the UI thread: builds a LynxView (attaches the GLDirect windowless
// renderer via the harmony branch of LynxViewBuilder::Build) and loads the
// staged test bundle.
void DoBringup(void* window, int width, int height) {
  if (BringupView()) {
    return;  // already built
  }

  base::FilePath assets;
  if (!base::PathService::Get(base::DIR_ASSETS, &assets)) {
    BU_ERR("DIR_ASSETS unavailable; cannot locate bundle");
    return;
  }
  base::FilePath bundle =
      assets.AppendASCII("resources").AppendASCII("main.lynx.bundle");
  if (!base::PathExists(bundle)) {
    BU_ERR("bundle not found: %{public}s", bundle.value().c_str());
    return;
  }
  BU_LOG("bundle: %{public}s (%{public}dx%{public}d)", bundle.value().c_str(),
         width, height);

  LynxViewBuilder builder;
  builder
      .SetScreenSize(static_cast<float>(width), static_cast<float>(height),
                     1.0f)
      .SetFrame(0, 0, static_cast<float>(width), static_cast<float>(height))
      .SetParent(window);

  auto view = builder.Build();
  if (!view) {
    BU_ERR("LynxViewBuilder::Build() returned null");
    return;
  }
  BU_LOG("LynxView built; loading bundle...");
  view->LoadFile(bundle.AsUTF8Unsafe(), "{}", "{}");
  BringupView() = std::move(view);
  BU_LOG("LoadFile issued; waiting for Clay to composite onto the surface");
}

}  // namespace

void LynxtronStartLynxBringup(void* window, int width, int height) {
  static std::once_flag once;
  std::call_once(once, [window, width, height] {
    // The XComponent surface arrives (ETS onLoad) before LynxtronMain has set
    // up the UI thread, so GetUIThreadTaskRunner() is often null here. Poll on
    // a detached thread until the UI thread exists, then post the bring-up onto
    // it. Cap the wait so we don't spin forever if init fails.
    std::thread([window, width, height] {
      for (int i = 0; i < 600; ++i) {  // up to ~60s
        if (auto runner = GetUIThreadTaskRunner()) {
          BU_LOG("UI thread ready after %{public}d ms; posting bring-up",
                 i * 100);
          runner->PostTask(FROM_HERE,
                           base::BindOnce(&DoBringup, window, width, height));
          return;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
      }
      BU_ERR("UI thread task runner never became ready; bring-up aborted");
    }).detach();
  });
}

}  // namespace lynxtron
