// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useState } from '@lynx-js/react';
import { useParams } from 'react-router';
import { TEST_MODULES } from './testRegistry';
import type { TestItem } from './testRegistry';
import { logInfo } from '../../utils/log';
import * as testStats from './testStats';
import { fontInput } from '../../testModules/zf/fontTest';

/**
 * ZF 测试 · 模块页
 * 一级菜单即模块导航: 当前模块由路由参数 /zf/:moduleId 决定;
 * lynx 模块额外渲染 SelectorQuery / AddFont 所需的目标节点区。
 *
 * 【统计】页头展示: 本模块总接口数量 / 通过 / 失败 / 通过率。
 *  - 自动执行 + 手动触发共用 testStats 统计(数 [PASS]/[FAIL] 日志)。
 * 【执行】不再一进入就自动触发, 由页头按钮"▶ 自动执行非交互用例"手动触发;
 *          交互(manual)用例需逐个点击按钮并按卡片提示操作。
 * 【addFont】卡片含输入框, 可自填 FONT_SRC 与 font-family 后运行。
 */
const AUTO_RUN_DELAY_MS = 800; // 布局就绪等待(渲染层 selectorQuery 等需要)
const AUTO_RUN_GAP_MS = 600; // 自动执行相邻用例间隔

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function TestModulePage() {
  const enabled = TEST_MODULES.filter((m) => m.tests.length > 0);
  const { moduleId } = useParams();
  const [fontReady, setFontReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<testStats.StatsSnapshot>(() => testStats.getSnapshot());
  // addFont 输入框(FONT_SRC 由用户填, 字体名固定 sq-font)
  const [fontSrc, setFontSrc] = useState('');
  const active = enabled.find((m) => m.id === moduleId) ?? enabled[0];
  const isLynx = active?.id === 'lynx';

  // 订阅统计 store 变更 → 刷新页头统计
  useEffect(() => {
    return testStats.subscribe(() => setStats(testStats.getSnapshot()));
  }, []);

  // 模块切换(路由变化)时: 仅重置统计, 不自动触发
  useEffect(() => {
    setFontReady(false);
    if (!active) return;
    testStats.beginModule(active.id);
    logInfo(`[ZF] 当前模块: ${active.label}`);
  }, [moduleId]);

  const runTest = (t: TestItem, auto = false) => {
    logInfo(`▶ ${auto ? '[自动]' : '[手动]'} 运行测试: ${t.label}`);
    testStats.setCurrentTest(t.id);
    t.run(() => setFontReady(true));
  };

  // 自动执行本模块所有非交互(manual=false)用例
  const runAutoAll = async () => {
    if (!active) return;
    if (running) {
      logInfo('[ZF] 上一轮自动执行尚未结束, 请稍候');
      return;
    }
    const auto = active.tests.filter((t) => !t.manual);
    if (auto.length === 0) {
      logInfo('[ZF] 本模块没有可自动执行的用例(全部为交互用例, 请手动触发)');
      return;
    }
    setRunning(true);
    logInfo(`[ZF] 开始自动执行 ${auto.length} 项非交互用例…`);
    await sleep(AUTO_RUN_DELAY_MS);
    for (const t of auto) {
      testStats.setCurrentTest(t.id);
      runTest(t, true);
      await sleep(AUTO_RUN_GAP_MS);
    }
    logInfo(testStats.formatSummary(active.label));
    setRunning(false);
  };

  if (!active) return null;

  return (
    <view className="testModuleContent">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle" style={{ fontSize: '30px' }}>{active.label}</text>
        <text className="pageSectionStats" style={{ fontSize: '24px', fontWeight: '700' }}>
          总接口:{stats.total} 通过:{stats.passed} 失败:{stats.failed} 通过率:{stats.rate}%
        </text>
      </view>

      {/* 自动执行按钮(紧凑, 无 emoji) */}
      <view
        bindtap={() => runAutoAll()}
        style={{
          marginTop: '10px',
          alignSelf: 'flex-start',
          height: '64px',
          padding: '0 24px',
          borderRadius: '10px',
          backgroundColor: running ? '#4a4d55' : '#2f6feb',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <text style={{ color: '#fff', fontSize: '28px', fontWeight: '600' }}>
          {running ? '自动执行中…' : '自动执行非交互用例'}
        </text>
      </view>

      <text className="testModuleDesc" style={{ fontSize: '28px', lineHeight: '40px' }}>{active.desc}</text>

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
            <text style={{ fontSize: '18px', color: '#8a8f98', marginLeft: '10px' }}>
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
        {active.tests.map((t) => {
          const c = stats.perTest[t.id];
          const passed = c?.passed ?? 0;
          const failed = c?.failed ?? 0;
          const isFont = t.id === 'addFont';
          return (
            <view className="testCard" key={t.id}>
              <view className="testButton" bindtap={() => runTest(t)}>
                <view className="testButtonDot" />
                <text className="testButtonText" style={{ fontSize: '28px' }}>
                  {t.label}{t.manual ? ' (手动)' : ''}
                </text>
                <text className="testButtonArrow" style={{ fontSize: '24px' }}>›</text>
              </view>
              <text className="testCardDesc" style={{ fontSize: '24px', lineHeight: '34px' }}>{t.desc}</text>

              {/* addFont: 输入框 */}
              {isFont && (
                <view style={{ marginTop: '8px' }}>
                  <text style={{ color: '#8a8f98', fontSize: '20px', marginBottom: '4px' }}>
                    FONT_SRC(字体地址)
                  </text>
                  <input
                    placeholder="url('http://.../xx.ttf') 或 data:URI"
                    style={{
                      width: '100%',
                      height: '34px',
                      borderRadius: '6px',
                      backgroundColor: '#1e2024',
                      color: '#e8e9ea',
                      padding: '0 8px',
                      fontSize: '20px',
                      border: '1px solid #3a3d45',
                    }}
                    bindinput={(e: any) => {
                      const v = e?.detail?.value ?? '';
                      setFontSrc(v);
                      fontInput.src = v;
                    }}
                  />
                </view>
              )}

              <text className="testCardCount" style={{ fontSize: '22px' }}>
                {t.manual ? '手动 ' : ''}通过 {passed} · 失败 {failed}
              </text>
              {t.manual && t.manualGuide ? (
                <view style={{ marginTop: '6px' }}>
                  {(t.manualGuide as string[]).map((line, i) => (
                    <text
                      key={i}
                      style={{
                        color: '#f5c26b',
                        fontSize: '22px',
                        lineHeight: '30px',
                      }}
                    >
                      {line}
                    </text>
                  ))}
                </view>
              ) : null}
            </view>
          );
        })}
      </view>
    </view>
  );
}