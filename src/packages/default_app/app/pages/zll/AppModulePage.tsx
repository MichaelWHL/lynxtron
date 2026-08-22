// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useState } from '@lynx-js/react';
import { log, logError, logInfo } from '../../utils/log';

// ── 主动调用类 App 接口 ──
const ACTIVE_APIS: Array<{ name: string; label: string; desc: string }> = [
  { name: 'testAppSetName', label: 'app.setName', desc: '设置应用名称, 结果 [APP][setName]' },
  { name: 'testAppGetName', label: 'app.getName()', desc: '读取应用名称, 结果 [APP][getName]' },
  { name: 'testAppGetPath', label: 'app.getPath()', desc: '枚举全部路径, 结果 [APP][getPath]' },
  { name: 'testAppFrameless', label: '无边框窗口', desc: 'frame:false 去掉 OHOS 原生边框' },
  { name: 'testAppQuit', label: 'app.quit()', desc: '退出应用(慎点)' },
];

// ── 事件/回调类 App 接口 ──
const EVENT_APIS: Array<{ name: string; label: string; desc: string }> = [
  { name: 'testAppWhenReady', label: 'app.whenReady()', desc: '应用就绪回调, 结果 [APP][whenReady]' },
  { name: 'testAppOpenUrl', label: 'app.on(open-url)', desc: '注册 open-url 深链监听' },
  { name: 'testAppBeforeQuit', label: 'app.on(before-quit)', desc: '注册 before-quit 监听' },
  { name: 'testAppWindowAllClosed', label: 'app.on(window-all-closed)', desc: '注册监听, 全部窗口关闭时 app.quit()' },
  { name: 'testFrameTimings', label: 'win.on(frame-timings)', desc: '帧率监控开关(结果在上方看板)' },
];

interface FpsStats {
  fps: number;
  avgMs: number;
  maxMs: number;
  frames: number;
}

/** App module 接口清单页: 顶部帧率看板 + API 按钮列表 */
export default function AppModulePage() {
  const [stats, setStats] = useState<FpsStats | null>(null);
  const [monitoring, setMonitoring] = useState(true);

  useEffect(() => {
    logInfo('[AppModule] App module API 页面已加载');

    // 订阅主进程推送的 fps-stats 实时帧率
    const emitter = lynx.getJSModule('GlobalEventEmitter') as any;
    const handler = (payload: any) => {
      if (payload && typeof payload.fps === 'number') {
        setStats({
          fps: payload.fps,
          avgMs: payload.avgMs,
          maxMs: payload.maxMs,
          frames: payload.frames,
        });
      }
    };
    emitter.addListener('fps-stats', handler, lynx);

    // 一进页面自动开启帧率监控
    NativeModules.bridge.call('testFrameTimings', { enabled: true }, (res: any) => {
      if (res && res.ok) {
        log('✓ 帧率监控已自动开启');
      } else {
        logError(`✗ 自动开启帧率监控失败: ${res && res.error ? res.error : JSON.stringify(res)}`);
      }
    });

    return () => {
      if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('fps-stats', handler, lynx);
      } else if (typeof emitter.off === 'function') {
        emitter.off('fps-stats', handler, lynx);
      }
    };
  }, []);

  // 帧率监控开关: 切换主进程 win.setFrameTimingsEnabled
  const toggleFps = () => {
    const next = !monitoring;
    setMonitoring(next);
    logInfo(`[AppModule] ${next ? '▶ 开启' : '■ 停止'} 帧率监控`);
    NativeModules.bridge.call('testFrameTimings', { enabled: next }, (res: any) => {
      if (res && res.ok) {
        log(`✓ testFrameTimings(${next}) 完成`);
      } else {
        logError(`✗ testFrameTimings 失败: ${res && res.error ? res.error : JSON.stringify(res)}`);
      }
    });
  };

  // 桥接主线程: 触发 default_app.ts 中注册的 app 接口测试
  const runTest = (name: string) => {
    if (name === 'testFrameTimings') {
      toggleFps();
      return;
    }
    logInfo(`▶ 触发主进程: ${name}`);
    NativeModules.bridge.call(name, {}, (res: any) => {
      if (res && res.ok) {
        log(`✓ ${name} 触发完成`);
      } else {
        logError(`✗ ${name} 触发失败: ${res && res.error ? res.error : JSON.stringify(res)}`);
      }
    });
  };

  return (
    <view className="pageStack">
      {/* ── 帧率看板 ── */}
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">App module · 帧率看板</text>
      </view>
      <view className="fpsPanel">
        <view className="fpsPanelHeader">
          <text className="fpsPanelTitle">win.on("frame-timings") 实时帧率</text>
          <view
            className={`fpsToggle ${monitoring ? 'fpsToggle-on' : ''}`}
            bindtap={toggleFps}
          >
            <view className={`fpsToggleDot ${monitoring ? 'fpsToggleDot-on' : ''}`} />
            <text className="fpsToggleText">{monitoring ? '监控中' : '开启监控'}</text>
          </view>
        </view>
        <view className="fpsRow">
          <view className="fpsCell">
            <text className={`fpsValue ${monitoring ? 'fpsValue-live' : ''}`}>
              {stats ? stats.fps : '--'}
            </text>
            <text className="fpsLabel">FPS</text>
          </view>
          <view className="fpsCell">
            <text className="fpsValue">{stats ? stats.avgMs : '--'}</text>
            <text className="fpsLabel">avg ms</text>
          </view>
          <view className="fpsCell">
            <text className="fpsValue">{stats ? stats.maxMs : '--'}</text>
            <text className="fpsLabel">max ms</text>
          </view>
          <view className="fpsCell">
            <text className="fpsValue">{stats ? stats.frames : '--'}</text>
            <text className="fpsLabel">frames</text>
          </view>
        </view>
      </view>

      {/* ── 主动调用类 ── */}
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">App module · 主动调用</text>
      </view>
      <view className="testGrid">
        {ACTIVE_APIS.map((t) => (
          <view className="testCard" key={t.name}>
            <view className="testButton" bindtap={() => runTest(t.name)}>
              <view className="testButtonDot" />
              <text className="testButtonText">{t.label}</text>
              <text className="testButtonArrow">›</text>
            </view>
            <text className="testCardDesc">{t.desc}</text>
          </view>
        ))}
      </view>

      {/* ── 事件/回调类 ── */}
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">App module · 事件/回调</text>
      </view>
      <view className="testGrid">
        {EVENT_APIS.map((t) => (
          <view className="testCard" key={t.name}>
            <view className="testButton" bindtap={() => runTest(t.name)}>
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
