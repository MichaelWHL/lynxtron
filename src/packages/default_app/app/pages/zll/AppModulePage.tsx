// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useRef, useState } from '@lynx-js/react';
import { log, logError, logInfo, logPass, logFail, subscribeLogs } from '../../utils/log';

// -- 主动调用类 App 接口 --
const ACTIVE_APIS: Array<{ name: string; label: string; desc: string }> = [
  { name: 'testAppSetName', label: 'app.setName', desc: '设置应用名称, 结果 [APP][setName]' },
  { name: 'testAppGetName', label: 'app.getName()', desc: '读取应用名称, 结果 [APP][getName]' },
  { name: 'testAppGetPath', label: 'app.getPath()', desc: '枚举全部路径, 结果 [APP][getPath]' },
  { name: 'testAppFrameless', label: '无边框窗口', desc: 'frame:false 去掉 OHOS 原生边框' },
  { name: 'testAppQuit', label: 'app.quit()', desc: '退出应用(慎点)' },
];

// -- 事件/回调类 App 接口 --
const EVENT_APIS: Array<{ name: string; label: string; desc: string }> = [
  { name: 'testAppWhenReady', label: 'app.whenReady()', desc: '应用就绪回调, 结果 [APP][whenReady]' },
  { name: 'testAppOpenUrl', label: 'app.on(open-url)', desc: '注册 open-url 深链监听' },
  { name: 'testAppBeforeQuit', label: 'app.on(before-quit)', desc: '注册 before-quit 监听' },
  { name: 'testAppWindowAllClosed', label: 'app.on(window-all-closed)', desc: '注册监听, 全部窗口关闭时 app.quit()' },
  { name: 'testFrameTimings', label: 'win.on(frame-timings)', desc: '帧率监控开关(结果在上方看板)' },
];

// -- 一键启动测试: 依次运行全部 App 接口 --
// testAppQuit 会直接退出应用, 不能放进批量测试
// log: 每个接口主进程会打印的日志标记, 以此为通过判据(见 APP_TEST_FNS 内 sendLog 格式)
const BATCH_TESTS: Array<{ name: string; label: string; log: string }> = [
  { name: 'testAppSetName', label: 'app.setName', log: '[APP][setName]' },
  { name: 'testAppGetName', label: 'app.getName()', log: '[APP][getName]' },
  { name: 'testAppGetPath', label: 'app.getPath()', log: '[APP][getPath]' },
  { name: 'testAppFrameless', label: '无边框窗口', log: '[APP][frameless]' },
  { name: 'testAppWhenReady', label: 'app.whenReady()', log: '[APP][whenReady]' },
  { name: 'testAppOpenUrl', label: 'app.on(open-url)', log: '[APP][open-url]' },
  { name: 'testAppBeforeQuit', label: 'app.on(before-quit)', log: '[APP][before-quit]' },
  { name: 'testAppWindowAllClosed', label: 'app.on(window-all-closed)', log: '[APP][window-all-closed]' },
  { name: 'testFrameTimings', label: 'win.on(frame-timings)', log: '[APP][frame-timings]' },
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
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState({ total: 0, passed: 0 });
  // 主进程日志采集缓冲: 订阅全局 log store, 判断每个接口是否打印了预期日志标记
  const logBuffer = useRef<string[]>([]);
  const seenLogId = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribeLogs((entries) => {
      for (const e of entries) {
        if (e.id > seenLogId.current) {
          seenLogId.current = e.id;
          logBuffer.current.push(e.text);
          if (logBuffer.current.length > 200) {
            logBuffer.current.splice(0, logBuffer.current.length - 200);
          }
        }
      }
    });
    return unsubscribe;
  }, []);

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

  // 调用单个主进程测试接口, 等待其执行完并返回(是否 ok 不再作为判据, 仅作同步屏障)
  const callApi = (name: string, data: any = {}): Promise<void> =>
    new Promise((resolve) => {
      NativeModules.bridge.call(name, data, () => {
        resolve();
      });
    });

  const clearLogBuffer = (): void => {
    logBuffer.current = [];
  };

  // 轮询日志缓冲, 判断是否在超时前打印了预期标记
  const waitForMarker = (marker: string, timeoutMs: number): Promise<boolean> =>
    new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const timer = setInterval(() => {
        if (logBuffer.current.some((t) => t.includes(marker))) {
          clearInterval(timer);
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          clearInterval(timer);
          resolve(false);
        }
      }, 50);
    });

  // 一键启动测试: 依次运行全部 App 接口, 以「是否打印了预期日志标记」判定通过
  const runAllTests = async () => {
    if (running) return;
    setRunning(true);
    setSummary({ total: BATCH_TESTS.length, passed: 0 });
    logInfo(`▶ 一键启动测试: 共 ${BATCH_TESTS.length} 个接口, 以日志打印判通过`);
    let passed = 0;
    for (const t of BATCH_TESTS) {
      clearLogBuffer();
      try {
        if (t.name === 'testFrameTimings') {
          await callApi(t.name, { enabled: true });
        } else {
          await callApi(t.name);
        }
      } catch (e) {
        logFail(`✗ ${t.label} bridge 调用异常: ${String(e)}`);
      }
      const ok = await waitForMarker(t.log, 3000);
      if (ok) {
        passed++;
        logPass(`✓ ${t.label} 通过(已打印 ${t.log})`);
      } else {
        logFail(`✗ ${t.label} 未通过(未检测到日志 ${t.log})`);
      }
      setSummary({ total: BATCH_TESTS.length, passed });
    }
    logInfo(`一键测试完成: 通过 ${passed}/${BATCH_TESTS.length}`);
    setRunning(false);
  };

  const pct = (ok: number, total: number): number => (total > 0 ? Math.round((ok / total) * 100) : 0);

  return (
    <view className="pageStack">
      {/* -- 帧率看板 -- */}
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

      {/* -- 主动调用类 -- */}
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

      {/* -- 事件/回调类 -- */}
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

      {/* -- 一键启动测试 -- */}
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">App module · 一键测试</text>
        <text className="pageSectionStats">
          {summary.total} 个接口 · 通过 {summary.passed} · {pct(summary.passed, summary.total)}%
        </text>
      </view>
      <view className="testGrid">
        <view className="testCard">
          <view className="testButton" bindtap={runAllTests}>
            <view className="testButtonDot" />
            <text className="testButtonText">{running ? '测试中…' : '一键启动测试'}</text>
            <text className="testButtonArrow">›</text>
          </view>
          <text className="testCardDesc">
            依次运行全部 App API (已排除 app.quit()), 采集主进程日志并按其是否打印标记判通过
          </text>
          <text className="testCardCount">
            总个数 {summary.total} · 通过 {summary.passed} · {pct(summary.passed, summary.total)}%
          </text>
        </view>
      </view>
    </view>
  );
}
