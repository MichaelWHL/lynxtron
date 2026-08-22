// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { testJSModule } from '../../testModules/zf/jsModuleTest';
import { logInfo } from '../../utils/log';

/** getJSModule 用例页 */
export default function JsModulePage() {
  useEffect(() => {
    logInfo('[ZF/JS] getJSModule 页面已加载');
  }, []);

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">JSModule · getJSModule/registerModule</text>
      </view>
      <view className="testCard">
        <view className="testButton" bindtap={() => testJSModule()}>
          <view className="testButtonDot" />
          <text className="testButtonText">运行用例</text>
          <text className="testButtonArrow">›</text>
        </view>
        <text className="testCardDesc">四个用例, 结果输出到下方 Console</text>
      </view>
    </view>
  );
}
