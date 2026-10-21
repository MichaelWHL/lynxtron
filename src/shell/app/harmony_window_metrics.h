// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#ifndef SHELL_APP_HARMONY_WINDOW_METRICS_H_
#define SHELL_APP_HARMONY_WINDOW_METRICS_H_

#include <cmath>
#include <cstdint>
#include <limits>
#include <mutex>
#include <unordered_map>

namespace lynxtron {

// ArkUI can report density before the C++ window or its UI runner exists.
// Keep it by Harmony window id, independently of NativeWindow lifetime.
class HarmonyWindowMetrics {
 public:
  bool SetPixelRatio(int32_t id, double value) {
    if (!std::isfinite(value) || value <= 0 ||
        value > std::numeric_limits<float>::max()) {
      return false;
    }
    const float ratio = static_cast<float>(value);
    if (id <= 0 || !std::isfinite(ratio) || ratio <= 0) {
      return false;
    }
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = ratios_.find(id);
    if (it != ratios_.end() && it->second == ratio) {
      return false;
    }
    ratios_[id] = ratio;
    return true;
  }

  float GetPixelRatio(int32_t id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = ratios_.find(id);
    return it == ratios_.end() ? 1.0f : it->second;
  }

  void Remove(int32_t id) {
    std::lock_guard<std::mutex> lock(mutex_);
    ratios_.erase(id);
  }

 private:
  mutable std::mutex mutex_;
  std::unordered_map<int32_t, float> ratios_;
};

// Only Lynx frame/screen dimensions are logical; surface and pointer data stay
// physical. Use floats here to preserve fractional dimensions at e.g. 1.25x.
inline float HarmonyLogicalPixels(float physical_pixels, float pixel_ratio) {
  return physical_pixels / pixel_ratio;
}

}  // namespace lynxtron

#endif  // SHELL_APP_HARMONY_WINDOW_METRICS_H_
