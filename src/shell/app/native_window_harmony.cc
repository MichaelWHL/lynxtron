// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "shell/app/native_window.h"

#include <hilog/log.h>

#include "shell/app/lynx_windowless_renderer_harmony.h"
#include "shell/common/gin_helper/dictionary.h"

#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x0000
#define LOG_TAG "LynxtronWindow"

namespace lynxtron {

// HarmonyOS NativeWindow — minimal concrete implementation.
//
// The window lifecycle and observer bookkeeping live in the NativeWindow base
// class (AddObserver/RemoveObserver, Notify*, InitFromOptions). Previously
// NativeWindow::Create returned nullptr, so JS code doing `new BaseWindow()`
// got a null and crashed at AddObserver. This class provides a real object so
// the JS window API works and connects to the XComponent surface supplied by
// the HAP.
//
// Bounds/title/visibility are tracked in-process so JS getters return sane
// values. GetNativeWindowHandle() returns the surface pointer once set.
class NativeWindowHarmony : public NativeWindow {
 public:
  NativeWindowHarmony(const gin_helper::Dictionary& options,
                      NativeWindow* parent)
      : NativeWindow(options, parent) {
    // Size the window to the real XComponent surface (physical px) so the
    // LynxView / Clay viewport fills the whole window instead of a fixed
    // 800x600 default (which left content in the bottom-left and made pointer
    // coordinates mismatch). Falls back to 800x600 if the surface has not
    // arrived yet.
    int w = 800, h = 600;
    lynxtron::GetCurrentHarmonySurfaceSize(&w, &h);
    OH_LOG_INFO(LOG_APP, "[Window] NativeWindowHarmony created %{public}dx%{public}d",
                w, h);
    bounds_ = gfx::Rect(0, 0, w, h);
    InitFromOptions(options);
  }

  ~NativeWindowHarmony() override {
    OH_LOG_INFO(LOG_APP, "[Window] NativeWindowHarmony destroyed");
  }

  // --- lifecycle ---
  void Close() override {
    OH_LOG_INFO(LOG_APP, "[Window] Close");
    NotifyWindowCloseButtonClicked();
  }
  void CloseImmediately() override {
    OH_LOG_INFO(LOG_APP, "[Window] CloseImmediately");
    NotifyWindowClosed();
  }

  // --- focus / visibility ---
  void Focus(bool focus) override {
    is_focused_ = focus;
    if (focus) {
      NotifyWindowFocus();
    } else {
      NotifyWindowBlur();
    }
  }
  bool IsFocused() override { return is_focused_; }
  void Show() override {
    is_visible_ = true;
    OH_LOG_INFO(LOG_APP, "[Window] Show");
    NotifyWindowShow();
  }
  void ShowInactive() override { is_visible_ = true; }
  void Hide() override {
    is_visible_ = false;
    NotifyWindowHide();
  }
  bool IsVisible() override { return is_visible_; }
  bool IsEnabled() override { return is_enabled_; }
  void SetEnabled(bool enable) override { is_enabled_ = enable; }

  // --- window state ---
  void Maximize() override {
    is_maximized_ = true;
    NotifyWindowMaximize();
  }
  void Unmaximize() override {
    is_maximized_ = false;
    NotifyWindowUnmaximize();
  }
  bool IsMaximized() const override { return is_maximized_; }
  void Minimize() override {
    is_minimized_ = true;
    NotifyWindowMinimize();
  }
  void Restore() override {
    is_minimized_ = false;
    is_maximized_ = false;
    NotifyWindowRestore();
  }
  bool IsMinimized() const override { return is_minimized_; }
  void SetFullScreen(bool fullscreen) override { is_fullscreen_ = fullscreen; }
  bool IsFullscreen() const override { return is_fullscreen_; }

  // --- geometry ---
  void SetBounds(const gfx::Rect& bounds, bool animate) override {
    bounds_ = bounds;
    NotifyWindowResize();
    NotifyWindowMove();
  }
  gfx::Rect GetBounds() const override { return bounds_; }
  float GetDevicePixelRatio() const override { return device_pixel_ratio_; }
  gfx::Rect GetNormalBounds() const override { return bounds_; }

  // --- resizable / movable ---
  void SetResizable(bool resizable) override { is_resizable_ = resizable; }
  void MoveTop() override {}
  bool IsResizable() const override { return is_resizable_; }
  void SetMovable(bool movable) override { is_movable_ = movable; }
  bool IsMovable() const override { return is_movable_; }
  void SetMinimizable(bool m) override { is_minimizable_ = m; }
  bool IsMinimizable() const override { return is_minimizable_; }
  void SetMaximizable(bool m) override { is_maximizable_ = m; }
  bool IsMaximizable() const override { return is_maximizable_; }
  void SetFullScreenable(bool f) override { is_fullscreenable_ = f; }
  bool IsFullScreenable() const override { return is_fullscreenable_; }
  void SetClosable(bool c) override { is_closable_ = c; }
  bool IsClosable() const override { return is_closable_; }

  // --- z-order / title ---
  void SetAlwaysOnTop(ui::ZOrderLevel z_order,
                      const std::string& level,
                      int relativeLevel) override {
    z_order_ = z_order;
  }
  ui::ZOrderLevel GetZOrderLevel() const override { return z_order_; }
  void Center() override {}
  void SetTitle(const std::string& title) override { title_ = title; }
  std::string GetTitle() const override { return title_; }
  // GetAlwaysOnTopLevel / SetActive / IsActive are MAC-only.

  // --- misc window chrome (no-op on harmony) ---
  void FlashFrame(bool flash) override {}
  void SetSkipTaskbar(bool skip) override {}
  void SetExcludedFromShownWindowsMenu(bool excluded) override {}
  bool IsExcludedFromShownWindowsMenu() override { return false; }
  void SetSimpleFullScreen(bool simple_fullscreen) override {
    is_fullscreen_ = simple_fullscreen;
  }
  bool IsSimpleFullScreen() override { return is_fullscreen_; }
  void SetHasShadow(bool has_shadow) override { has_shadow_ = has_shadow; }
  bool HasShadow() override { return has_shadow_; }
  void SetOpacity(const double opacity) override { opacity_ = opacity; }
  double GetOpacity() override { return opacity_; }
  void SetFocusable(bool focusable) override { is_focusable_ = focusable; }
  bool IsFocusable() const override { return is_focusable_; }
  void SetParentWindow(NativeWindow* parent) override {}

  // --- native handles (GetNativeWindow is MAC-only) ---
  NativeWindowHandle GetNativeWindowHandle() const override {
    return surface_;
  }

  // --- progress / workspaces ---
  void SetProgressBar(double progress, const ProgressState state) override {}
  void SetVisibleOnAllWorkspaces(bool visible,
                                 bool visibleOnFullScreen,
                                 bool skipTransformProcessType) override {}
  bool IsVisibleOnAllWorkspaces() override { return false; }

  // Traffic Light / window button APIs are MAC-only (guarded by
  // BUILDFLAG(IS_MAC) in native_window.h), so no overrides needed here.

 protected:
  // No window chrome on harmony yet — content bounds == window bounds.
  gfx::Rect ContentBoundsToWindowBounds(
      const gfx::Rect& bounds) const override {
    return bounds;
  }
  gfx::Rect WindowBoundsToContentBounds(
      const gfx::Rect& bounds) const override {
    return bounds;
  }

 private:
  gfx::Rect bounds_;
  std::string title_;
  void* surface_ = nullptr;  // OHOS XComponent surface, set by HAP later.

  bool is_focused_ = false;
  bool is_visible_ = false;
  bool is_enabled_ = true;
  bool is_maximized_ = false;
  bool is_minimized_ = false;
  bool is_fullscreen_ = false;
  bool is_resizable_ = true;
  bool is_movable_ = true;
  bool is_minimizable_ = true;
  bool is_maximizable_ = true;
  bool is_fullscreenable_ = true;
  bool is_closable_ = true;
  bool is_active_ = false;
  bool is_focusable_ = true;
  bool has_shadow_ = true;
  double opacity_ = 1.0;
  float device_pixel_ratio_ = 1.0f;
  ui::ZOrderLevel z_order_ = ui::ZOrderLevel::kNormal;
};

// static
NativeWindow* NativeWindow::Create(const gin_helper::Dictionary& options,
                                   NativeWindow* parent) {
  return new NativeWindowHarmony(options, parent);
}

}  // namespace lynxtron
