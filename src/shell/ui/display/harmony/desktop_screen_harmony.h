// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#ifndef LYNXTRON_SHELL_UI_DISPLAY_HARMONY_DESKTOP_SCREEN_HARMONY_H_
#include <vector>
#define LYNXTRON_SHELL_UI_DISPLAY_HARMONY_DESKTOP_SCREEN_HARMONY_H_


#include "ui/display/display.h"
#include "ui/display/screen.h"

namespace views {

class DesktopScreenHarmony : public display::Screen {
 public:
  DesktopScreenHarmony();
  DesktopScreenHarmony(const DesktopScreenHarmony&) = delete;
  DesktopScreenHarmony& operator=(const DesktopScreenHarmony&) = delete;
  ~DesktopScreenHarmony() override;

  // display::Screen:
  gfx::Point GetCursorScreenPoint() override;
  int GetNumDisplays() const override;
  const std::vector<display::Display>& GetAllDisplays() const override;
  display::Display GetDisplayNearestWindow(
      gfx::NativeWindow window) const override;
  display::Display GetDisplayNearestPoint(
      const gfx::Point& point) const override;
  display::Display GetDisplayMatching(
      const gfx::Rect& match_rect) const override;
  display::Display GetPrimaryDisplay() const override;
  void AddObserver(display::DisplayObserver* observer) override;
  void RemoveObserver(display::DisplayObserver* observer) override;

 private:
  void EnsureDisplays() const;

  mutable std::vector<display::Display> displays_;
  std::vector<display::DisplayObserver*> observers_; // simple vector, DisplayObserver doesnt extend CheckedObserver
};

}  // namespace views

#endif  // LYNXTRON_SHELL_UI_DISPLAY_HARMONY_DESKTOP_SCREEN_HARMONY_H_
