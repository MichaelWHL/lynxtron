// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useState } from '@lynx-js/react';
import { useParams } from 'react-router';
import { TEST_MODULES } from './testRegistry';
import type { TestItem } from './testRegistry';
import { logInfo } from '../../utils/log';

/**
 * ZF 测试 · 模块页
 * 一级菜单即模块导航: 当前模块由路由参数 /zf/:moduleId 决定;
 * lynx 模块额外渲染 SelectorQuery / AddFont 所需的目标节点区。
 */
export default function TestModulePage() {
  const enabled = TEST_MODULES.filter((m) => m.tests.length > 0);
  const { moduleId } = useParams();
  const [fontReady, setFontReady] = useState(false);
  const active = enabled.find((m) => m.id === moduleId) ?? enabled[0];
  const isLynx = active?.id === 'lynx';

  // 模块切换(路由变化)时重置 addFont 渲染状态
  useEffect(() => {
    setFontReady(false);
    if (active) logInfo(`[ZF] 当前模块: ${active.label}`);
  }, [moduleId]);

  const runTest = (t: TestItem) => {
    logInfo(`▶ 运行测试: ${t.label}`);
    t.run(() => setFontReady(true));
  };

  if (!active) return null;

  return (
    <view className="testModuleContent">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">{active.label}</text>
      </view>
      <text className="testModuleDesc">{active.desc}</text>

      {/* lynx 模块: SelectorQuery / AddFont 测试目标节点区 */}
      {isLynx && (
        <view className="lynxTargetArea">
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
            <view
              className="lxp-item"
              style={{
                width: '80px',
                height: '40px',
                backgroundColor: '#3fb96b',
                borderRadius: '6px',
                marginLeft: '8px',
              }}
            />
            <view
              className="lxp-item"
              style={{
                width: '80px',
                height: '40px',
                backgroundColor: '#3fb96b',
                borderRadius: '6px',
                marginLeft: '8px',
              }}
            />
            <view
              className="lxp-item"
              style={{
                width: '80px',
                height: '40px',
                backgroundColor: '#3fb96b',
                borderRadius: '6px',
                marginLeft: '8px',
              }}
            />
            <text style={{ fontSize: '11px', color: '#8a8f98', marginLeft: '10px' }}>
              测试目标: #lxp-target + 3× .lxp-item
            </text>
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
        </view>
      )}

      <view className="testGrid">
        {active.tests.map((t) => (
          <view className="testCard" key={t.id}>
            <view className="testButton" bindtap={() => runTest(t)}>
              <view className="testButtonDot" />
              <text className="testButtonText">{t.label}</text>
              <text className="testButtonArrow">›</text>
            </view>
            <text className="testCardDesc">{t.desc}</text>
          </view>
        ))}
      </view>
    </view>
  );
}
