// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useState } from '@lynx-js/react';
import { testAddFont } from '../../testModules/zf/fontTest';
import { logInfo } from '../../utils/log';

/** addFont 用例页: #ft-custom 在 addFont 成功后才动态渲染 */
export default function FontPage() {
  const [fontReady, setFontReady] = useState(false);
  const enableFontTest = () => setFontReady(true);

  useEffect(() => {
    logInfo('[ZF/FT] addFont 页面已加载');
  }, []);

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">AddFont · addFont(data URI) 验证</text>
      </view>

      <view className="sqTargetRow">
        {fontReady ? (
          <text
            id="ft-custom"
            style={{
              fontFamily: 'sq-font',
              fontSize: '28px',
              color: '#e8e9ea',
              marginLeft: '16px',
              backgroundColor: '#2c2e34',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            The quick brown fox jumps over the lazy dog 0123456789
          </text>
        ) : (
          <text
            style={{
              fontFamily: 'sq-font',
              fontSize: '28px',
              color: '#6d7178',
              marginLeft: '16px',
              backgroundColor: '#1e2024',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            #ft-custom 待 addFont 后出现
          </text>
        )}
        <text
          id="ft-default"
          style={{
            fontSize: '28px',
            color: '#e8e9ea',
            marginLeft: '8px',
            backgroundColor: '#2c2e34',
            padding: '4px 8px',
            borderRadius: '6px',
          }}
        >
          The quick brown fox jumps over the lazy dog 0123456789
        </text>
      </view>

      <view className="testCard">
        <view className="testButton" bindtap={() => testAddFont(() => enableFontTest())}>
          <view className="testButtonDot" />
          <text className="testButtonText">运行用例</text>
          <text className="testButtonArrow">›</text>
        </view>
        <text className="testCardDesc">字体加载 + 轮询宽度测量</text>
      </view>
    </view>
  );
}
