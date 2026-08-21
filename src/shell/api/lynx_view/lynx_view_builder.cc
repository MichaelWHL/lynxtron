// Copyright 2025 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/api/lynx_view/lynx_view_builder.h"

#include <unordered_map>
#include <utility>

#include "base/base_paths.h"
#include "base/files/file_path.h"
#include "base/logging.h"
#include "base/path_service.h"
#include "build/build_config.h"
#include "lynx/platform/embedder/public/lynx_view.h"
#if BUILDFLAG(IS_HARMONY)
#include "shell/app/lynx_windowless_renderer_harmony.h"
#endif
#include "shell/api/lynx_view/lynx_view.h"
#include "shell/api/lynx_view/lynx_view_impl.h"
#include "shell/api/lynx_view/module/lynx_bridge_module.h"
#include "shell/api/lynx_view/module/lynx_hybrid_monitor_module.h"
#include "shell/api/lynx_view/module/lynx_node_module.h"
#include "shell/lynx/resource_fetcher/lynx_generic_resource_fetcher_factory.h"

namespace lynxtron {

struct LynxViewBuilder::Impl {
  lynx::pub::LynxView::Builder builder;
};

LynxViewBuilder::LynxViewBuilder() : impl_(std::make_unique<Impl>()) {}

LynxViewBuilder::~LynxViewBuilder() = default;

LynxViewBuilder& LynxViewBuilder::SetScreenSize(float width,
                                                float height,
                                                float pixel_ratio) {
  impl_->builder.SetScreenSize(width, height, pixel_ratio);
  return *this;
}

LynxViewBuilder& LynxViewBuilder::SetFrame(float x,
                                           float y,
                                           float width,
                                           float height) {
  impl_->builder.SetFrame(x, y, width, height);
  return *this;
}

LynxViewBuilder& LynxViewBuilder::SetICUDataPath(
    const std::string& icu_data_path) {
  impl_->builder.SetICUDataPath(icu_data_path);
  return *this;
}

LynxViewBuilder& LynxViewBuilder::SetParent(void* parent) {
  impl_->builder.SetParent(parent);
  return *this;
}

LynxViewBuilder& LynxViewBuilder::SetGenericResourceFetcher(
    std::shared_ptr<lynx::pub::LynxGenericResourceFetcher> fetcher) {
  impl_->builder.SetGenericResourceFetcher(fetcher);
  return *this;
}

LynxViewBuilder& LynxViewBuilder::SetLynxWindow(
    base::WeakPtr<api::LynxWindow> lynx_window) {
  lynx_window_ = lynx_window;
  return *this;
}

#if BUILDFLAG(IS_HARMONY)
LynxViewBuilder& LynxViewBuilder::SetWindowId(int32_t window_id) {
  harmony_window_id_ = window_id;
  return *this;
}

LynxViewBuilder& LynxViewBuilder::SetCppWindowId(int32_t cpp_window_id) {
  cpp_window_id_ = cpp_window_id;
  return *this;
}
#endif

LynxViewBuilder& LynxViewBuilder::SetNodeIntegrationPreload(
    const std::vector<std::string>& preload) {
  node_integration_preload_ = preload;
  return *this;
}

LynxViewBuilder& LynxViewBuilder::SetNativeViewCreator(
    const char* name,
    lynx_native_view_creator creator,
    void* opaque) {
  if (!name || !*name) {
    LOG(ERROR) << "Invalid native view creator name: " << name;
    return *this;
  }
  lynx_view_builder_register_native_view(impl_->builder.Impl(), name, creator,
                                         opaque);
  return *this;
}

std::unique_ptr<LynxView> LynxViewBuilder::Build() {
  base::FilePath icu_data_path;
  base::FilePath dir_path;
#if BUILDFLAG(IS_MAC)
  if (base::PathService::Get(base::DIR_ASSETS, &dir_path)) {
#else
  if (base::PathService::Get(base::DIR_MODULE, &dir_path)) {
#endif
    icu_data_path = dir_path.AppendASCII("icudtl.dat");
  }
  SetICUDataPath(icu_data_path.AsUTF8Unsafe());

  SetGenericResourceFetcher(
      LynxGenericResourceFetcherFactory::Create(lynx_window_));

  if (!node_integration_preload_.empty()) {
    RegisterLynxNodeModuleToLynxView(impl_->builder.Impl(),
                                     node_integration_preload_);
  }
  RegisterLynxBridgeModuleToLynxView(impl_->builder.Impl(), lynx_window_);

  RegisterLynxHybridMonitorModuleToLynxView(impl_->builder.Impl(),
                                            lynx_window_);

#if BUILDFLAG(IS_HARMONY)
  // HarmonyOS has no desktop windowing (glfw). Render into the XComponent
  // surface via the GLDirect windowless renderer bound to our EGL context.
  // The surface arrives asynchronously (ETS onLoad -> LynxtronSetNativeSurface),
  // so it may not be ready yet when a view is built headlessly; in that case
  // the view is created without a renderer and can be attached later.
  std::shared_ptr<lynx::pub::LynxWindowlessRenderer> renderer;
  if (harmony_window_id_ > 0) {
    renderer = GetHarmonyWindowlessRendererForWindow(harmony_window_id_);
    if (!renderer) {
      // The XComponent surface has not arrived yet. Use a placeholder renderer
      // so the LynxView can be built immediately; the real renderer will be
      // bound when CreateHarmonyWindowlessRenderer() is called from the surface
      // callback. This avoids sharing another window's renderer in multi-window
      // mode.
      renderer =
          GetOrCreateHarmonyPlaceholderRendererForWindow(harmony_window_id_);
    }
  } else if (cpp_window_id_ > 0) {
    // The ArkTS side has not bound this window's HarmonyOS id yet (the OS
    // window is created asynchronously). Use a placeholder keyed by the stable
    // C++ window id so this view never grabs another window's renderer; it is
    // re-keyed by HarmonyOS id once LynxtronOnHarmonyWindowCreated runs.
    renderer =
        GetOrCreateHarmonyPlaceholderRendererForCppWindow(cpp_window_id_);
  } else {
    // Legacy single-window fallback: the surface arrived before the view was
    // built and was stored as the "current" renderer.
    renderer = GetCurrentHarmonyWindowlessRenderer();
  }
  if (renderer) {
    impl_->builder.SetWindowlessRenderer(renderer);
    CaptureHarmonyLynxPlatformTaskRunner();
    LOG(INFO) << "LynxView: using HarmonyOS EGL GLDirect windowless renderer";
  } else {
    LOG(WARNING) << "LynxView: no XComponent surface yet; built without renderer";
  }
#endif

  auto view_impl = std::make_unique<LynxViewImpl>();
  view_impl->Initialize(impl_->builder.Build());
  return LynxView::Create(std::move(view_impl));
}
}  // namespace lynxtron
