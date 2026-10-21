// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Host-only regression test (no Harmony SDK required):
// Build this file with -std=c++17 -pthread -Isrc and run the resulting binary.
#include "shell/app/harmony_window_metrics.h"

#include <cassert>
#include <cmath>
#include <iostream>
#include <limits>
#include <thread>

int main() {
  lynxtron::HarmonyWindowMetrics metrics;
  assert(metrics.GetPixelRatio(10) == 1.0f);
  // An early report survives until the native window is created/bound.
  assert(metrics.SetPixelRatio(10, 2.0));
  assert(metrics.GetPixelRatio(10) == 2.0f);
  assert(!metrics.SetPixelRatio(10, 2.0));
  assert(metrics.SetPixelRatio(11, 1.25));
  assert(metrics.GetPixelRatio(10) == 2.0f);
  assert(metrics.GetPixelRatio(11) == 1.25f);

  for (double invalid : {0.0, -1.0, std::numeric_limits<double>::infinity(),
                         std::numeric_limits<double>::quiet_NaN(),
                         std::numeric_limits<double>::max(),
                         std::numeric_limits<double>::denorm_min()}) {
    assert(!metrics.SetPixelRatio(10, invalid));
    assert(metrics.GetPixelRatio(10) == 2.0f);
  }
  assert(!metrics.SetPixelRatio(-1, 2.0));
  assert(!metrics.SetPixelRatio(0, 2.0));

  for (float ratio : {1.0f, 1.25f, 1.5f, 2.0f, 3.0f}) {
    float logical = lynxtron::HarmonyLogicalPixels(1201.0f, ratio);
    assert(std::abs(logical * ratio - 1201.0f) < 0.001f);
  }
  assert(lynxtron::HarmonyLogicalPixels(1200, metrics.GetPixelRatio(10)) ==
         600);
  // Density-only change, without a surface resize; no double multiplication.
  assert(metrics.SetPixelRatio(10, 1.5));
  assert(lynxtron::HarmonyLogicalPixels(1200, metrics.GetPixelRatio(10)) ==
         800);
  assert(metrics.GetPixelRatio(11) == 1.25f);
  std::thread writer([&metrics] {
    for (int i = 0; i < 10000; ++i) {
      metrics.SetPixelRatio(12, i % 2 == 0 ? 1.25 : 2.0);
    }
  });
  for (int i = 0; i < 10000; ++i) {
    const float ratio = metrics.GetPixelRatio(12);
    assert(ratio == 1.0f || ratio == 1.25f || ratio == 2.0f);
  }
  writer.join();
  metrics.Remove(10);
  assert(metrics.GetPixelRatio(10) == 1.0f);
  assert(metrics.GetPixelRatio(11) == 1.25f);
  // Reusing a destroyed window id must not inherit its old density.
  assert(metrics.SetPixelRatio(10, 3.0));
  assert(metrics.GetPixelRatio(10) == 3.0f);
  std::cout
      << "PASS: early density, per-window isolation, invalid values, "
         "fractional scaling, density-only change, concurrency, cleanup\n";
}
