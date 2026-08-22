// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { testSelectorQuery } from '../../testModules/zf/selectorQueryTest';
import { logInfo } from '../../utils/log';

/** createSelectorQuery 用例页: 需要页面存在 #lxp-target 与 .lxp-item 节点 */
export default function SelectorQueryPage() {
  useEffect(() => {
    logInfo('[ZF/SQ] createSelectorQuery 页面已加载');
  }, []);

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">SelectorQuery · createSelectorQuery 六个用例</text>
      </view>

      <view className="sqTargetRow">
        <view
          id="lxp-target"
          style={{
            width: '160px',
            height: '64px',
            backgroundColor: '#4f8cff',
            borderRadius: '8px',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <text style={{ color: '#fff', fontSize: '12px' }}>#lxp-target</text>
        </view>
        <view className="lxp-item" style={{ width: '80px', height: '40px', backgroundColor: '#3fb96b', borderRadius: '6px', marginLeft: '8px' }} />
        <view className="lxp-item" style={{ width: '80px', height: '40px', backgroundColor: '#3fb96b', borderRadius: '6px', marginLeft: '8px' }} />
        <view className="lxp-item" style={{ width: '80px', height: '40px', backgroundColor: '#3fb96b', borderRadius: '6px', marginLeft: '8px' }} />
        <text style={{ fontSize: '11px', color: '#8a8f98', marginLeft: '10px' }}>测试目标: #lxp-target + 3× .lxp-item</text>
      </view>

      <view className="testCard">
        <view className="testButton" bindtap={() => testSelectorQuery()}>
          <view className="testButtonDot" />
          <text className="testButtonText">运行用例</text>
          <text className="testButtonArrow">›</text>
        </view>
        <text className="testCardDesc">结果输出到下方 Console</text>
      </view>
    </view>
  );
}
