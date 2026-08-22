// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { testModuleLoader } from '../../testModules/zf/moduleLoaderTest';
import { logInfo } from '../../utils/log';

/** getModuleLoader().load() 用例页 */
export default function ModuleLoaderPage() {
  useEffect(() => {
    logInfo('[ZF/ML] getModuleLoader 页面已加载');
  }, []);

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">ModuleLoader · getModuleLoader().load()</text>
      </view>
      <view className="testCard">
        <view className="testButton" bindtap={() => testModuleLoader()}>
          <view className="testButtonDot" />
          <text className="testButtonText">运行用例</text>
          <text className="testButtonArrow">›</text>
        </view>
        <text className="testCardDesc">加载原生模块 lynxtron_hello 六个用例</text>
      </view>
    </view>
  );
}
