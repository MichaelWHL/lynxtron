// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { logInfo } from '../../utils/log';

/** Window management test placeholder page (corresponds to testModules/sph). */
export default function WindowPage() {
  useEffect(() => {
    logInfo('[SPH] Window test page loaded');
  }, []);

  // Trigger the SPH WindowManager test suite in the main process via bridge.
  const handleRunTests = () => {
    logInfo('[SPH] WindowManager tests triggered');
    NativeModules.bridge.call(
      'runWindowManagerTests',
      {},
      (res: any) => {}
    );
  };

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">Window Tests</text>
      </view>
      <text className="pageDesc">
        Window management cases (testModules/sph) currently run as main-process scripts; results are pushed to the bottom Console via bridge.
      </text>
      <view className="testCard">
        <view className="testButton" bindtap={handleRunTests}>
          <view className="testButtonDot" />
          <text className="testButtonText">Run Window Tests</text>
          <text className="testButtonArrow">›</text>
        </view>
        <text className="testCardDesc">Tap the left menu to switch routes and verify page navigation</text>
      </view>
    </view>
  );
}
