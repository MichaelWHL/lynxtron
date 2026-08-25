// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { app, clipboard, LynxWindow } from "lynxtron";
import { BridgeEventCallback, ensureTestFns, safeStringify } from './testModules/zf/utils.js';
import { runSphTests } from './testModules/sph/index.js';

let mainWindow: LynxWindow | null = null;

// 日志通道就绪标志: loadFile 完成后置 true。
let logChannelReady = false;

// 待发送日志队列: 按产生顺序缓存 mainWindow 就绪前的日志。
const pendingLogs: Array<{ level: 'log' | 'warn' | 'error'; text: string }> = [];

// 把缓存的日志按入队顺序统一发送到渲染进程 LogPanel。
function flushPendingLogs(): void {
  if (!mainWindow || !logChannelReady) return;
  const logs = pendingLogs.splice(0);
  for (const l of logs) {
    try {
      mainWindow.sendGlobalEvent('bridge-log', { level: l.level, text: l.text, from: 'main' });
    } catch {
      // 忽略发送异常
    }
  }
}

// 公共发送日志事件: mainWindow 未初始化时先缓存, 初始化完成后按序发送。
function sendLog(level: 'log' | 'warn' | 'error', ...args: unknown[]): void {
  const text = args.map(safeStringify).join(' ');
  if (mainWindow && logChannelReady) {
    try {
      mainWindow.sendGlobalEvent('bridge-log', { level, text, from: 'main' });
    } catch {
      // 忽略发送异常
    }
  } else {
    pendingLogs.push({ level, text });
  }
}

// 窗口初始化完成后, 把主进程 console.log/warn/error 一并转发到渲染层 LogPanel,
// 使 testDemo.ts 等主进程模块里的 console 输出也能在页面 LogPanel 看到。
// 注意: 仅在 loadFile(窗口就绪)之后才重写 —— 初始化阶段主进程底层依赖
// console 输出, 若提前重写会影响窗口初始化。
let consoleForwardInstalled = false;
function installConsoleForward(): void {
  if (consoleForwardInstalled) return;
  consoleForwardInstalled = true;
  const raw = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...args: unknown[]) => {
    sendLog('log', ...args);
    raw.log(...args);
  };
  console.warn = (...args: unknown[]) => {
    sendLog('warn', ...args);
    raw.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    sendLog('error', ...args);
    raw.error(...args);
  };
}

// app.getPath() 枚举的全部路径名(与 Electron app.getPath 对齐)
const APP_PATH_NAMES = [
  'home',
  'appData',
  'assets',
  'userData',
  'temp',
  'exe',
  'module',
  'desktop',
  'documents',
  'downloads',
  'music',
  'pictures',
  'videos',
  'recent',
  'logs',
  'crashDumps',
] as const;

/** 安全读取 app.getPath(name), 失败返回 error 文本 */
function safeGetPath(name: string): string {
  try {
    return app.getPath(name as never);
  } catch (e) {
    return 'ERROR: ' + String(e);
  }
}

/** app.getPath() OHOS 路径枚举测试, 日志格式与 [APP][setName] 对齐 */
function testAppGetPath(): void {
  sendLog('log', '═══════ app.getPath() OHOS 测试 ═══════');
  // 获取来源: 以 appData 为基准来源路径
  sendLog('log', `[APP][getPath] appData(source) -> ${safeGetPath('appData')}`);
  for (const name of APP_PATH_NAMES) {
    sendLog('log', `[APP][getPath] ${name.padEnd(12)} -> ${safeGetPath(name)}`);
  }
  // 派生关系验证
  const appData = safeGetPath('appData');
  const userData = safeGetPath('userData');
  const logs = safeGetPath('logs');
  const appName = app.getName();
  sendLog(
    'log',
    `[APP][getPath] [DERIVED] userData = appData + appName ? ${userData === appData + '/' + appName ? '✅ YES' : '❌ NO'}`
  );
  sendLog(
    'log',
    `[APP][getPath] [DERIVED] logs = userData + "logs" ? ${logs === userData + '/logs' ? '✅ YES' : '❌ NO'}`
  );
  sendLog('log', '[APP][getPath] ═══ 完成 ═══');
}

// 已注册的 app 事件监听器名, 防止按钮重复点击造成重复监听
const registeredAppEvents = new Set<string>();

// ── 帧率监控 (win.on('frame-timings') / win.setFrameTimingsEnabled) ──
let frameTimingsRegistered = false;

/** 处理 win 的 frame-timings 事件, 统计后推送到 UI 实时 FPS 看板 */
const onFrameTimings = (_event: Event, timings: Array<[number, number]>): void => {
  if (!timings || timings.length === 0) return;
  let totalNs = 0;
  let maxNs = 0;
  for (const [startNs, finishNs] of timings) {
    const durNs = finishNs - startNs;
    totalNs += durNs;
    if (durNs > maxNs) maxNs = durNs;
  }
  const stats = {
    fps: timings.length, // 采样周期内的帧数 ≈ FPS
    avgMs: Number((totalNs / timings.length / 1e6).toFixed(2)),
    maxMs: Number((maxNs / 1e6).toFixed(2)),
    frames: timings.length,
  };
  try {
    mainWindow?.sendGlobalEvent('fps-stats', stats);
  } catch {
    // 忽略发送异常
  }
};

// ── 窗口事件监听测试 (win.on('blur'|'focus'|...) ) ──
// 最近一次提交「窗口事件」新增了 ArkTS→C++→JS 的窗口状态事件管线。这里在主进程
// 注册监听, 每次触发时推送到渲染层 GlobalEventEmitter('win-event') 供页面计数。
const WIN_EVENTS = [
  'blur', 'focus', 'show', 'hide',
  'minimize', 'restore', 'maximize', 'unmaximize',
  'enter-full-screen', 'leave-full-screen',
  'resize', 'resized', 'move', 'moved', 'will-resize',
] as const;

const registeredWinEvents = new Set<string>();

function registerWinEventListeners(): number {
  const win = mainWindow;
  if (!win) {
    sendLog('warn', '[WIN][events] mainWindow 未就绪');
    return 0;
  }
  let newly = 0;
  for (const name of WIN_EVENTS) {
    if (registeredWinEvents.has(name)) continue;
    registeredWinEvents.add(name);
    newly++;
    (win as any).on(name, (...args: unknown[]) => {
      const detail = safeStringify(args.slice(1));
      sendLog('log', `[WIN][events] win.on("${name}") fired${detail && detail !== '[]' ? ' ' + detail : ''}`);
      try {
        mainWindow?.sendGlobalEvent('win-event', { event: name, detail, ts: Date.now() });
      } catch {
        // 忽略发送异常
      }
    });
  }
  sendLog('log', `[WIN][events] 注册 ${newly} 个监听(累计 ${registeredWinEvents.size})`);
  return newly;
}

/** App module 接口测试函数: 由 AppModulePage 按钮经 bridge 主动触发 */
const APP_TEST_FNS: Record<string, (data?: unknown) => void | Promise<void>> = {
  // ── 主动调用类 ──
  testAppSetName() {
    app.setName('醒图接口测试');
    sendLog('log', '[APP][setName] setName success');
    sendLog('log', '[APP][getName]', app.getName());
  },
  testAppGetName() {
    sendLog('log', '[APP][getName]', app.getName());
  },
  testAppGetPath() {
    testAppGetPath();
  },
  // 去掉 OHOS 原生边框: 创建 frame:false 的无边框窗口
  testAppFrameless() {
    const win = new LynxWindow({ frame: false, width: 600, height: 400 });
    sendLog('log', '[APP][frameless] 已创建无边框窗口 frame=false, id =', String((win as unknown as { id?: number }).id ?? '?'));
  },
  testAppQuit() {
    sendLog('log', '[APP][quit] app.quit() called');
    app.quit();
  },

  // ── 事件/回调类 ──
  testAppWhenReady() {
    app.whenReady().then(() => {
      sendLog('log', '[APP][whenReady] ready, app name:', app.getName());
    });
  },
  testAppOpenUrl() {
    if (!registeredAppEvents.has('open-url')) {
      registeredAppEvents.add('open-url');
      app.on('open-url', (_event, url) => {
        sendLog('log', `[APP][open-url] open-url event fired, url: "${url}"`);
      });
      sendLog('log', '[APP][open-url] 已注册 open-url 监听');
    } else {
      sendLog('log', '[APP][open-url] open-url 监听已存在');
    }
  },
  testAppBeforeQuit() {
    if (!registeredAppEvents.has('before-quit')) {
      registeredAppEvents.add('before-quit');
      app.on('before-quit', () => {
        sendLog('log', '[APP][before-quit] before-quit event fired');
      });
      sendLog('log', '[APP][before-quit] 已注册 before-quit 监听');
    } else {
      sendLog('log', '[APP][before-quit] before-quit 监听已存在');
    }
  },
  testAppWindowAllClosed() {
    if (!registeredAppEvents.has('window-all-closed')) {
      registeredAppEvents.add('window-all-closed');
      app.on('window-all-closed', () => {
        sendLog('log', '[APP][window-all-closed] window-all-closed event fired, 调用 app.quit()');
        app.quit();
      });
      sendLog('log', '[APP][window-all-closed] 已注册 window-all-closed 监听(全部关闭时 app.quit())');
    } else {
      sendLog('log', '[APP][window-all-closed] window-all-closed 监听已存在');
    }
  },

  // 帧率监控开关: data = { enabled: boolean }, 结果经 'fps-stats' 事件推送到 UI 看板
  testFrameTimings(data) {
    const win = mainWindow;
    if (!win) {
      sendLog('warn', '[APP][frame-timings] mainWindow 未就绪');
      return;
    }
    const enabled = Boolean((data as { enabled?: unknown } | undefined)?.enabled);
    if (enabled) {
      if (!frameTimingsRegistered) {
        frameTimingsRegistered = true;
        win.on('frame-timings', onFrameTimings);
      }
      win.setFrameTimingsEnabled(true, 1000);
      sendLog('log', '[APP][frame-timings] 已开启帧率监控(win.on("frame-timings"))');
    } else {
      win.setFrameTimingsEnabled(false);
      sendLog('log', '[APP][frame-timings] 已停止帧率监控');
    }
  },

  // Window 管理测试: 由 SPH WindowPage 按钮触发，委托给 testModules/sph/index.ts
  async runWindowManagerTests() {
    sendLog('log', '[APP][runWindowManagerTests] 触发 SPH WindowManager 测试');
    await runSphTests();
  },
};

async function createWindow() {
  app.setName("醒图接口测试");
  await app.whenReady().then(() => {
    sendLog('log', '[APP][whenReady] ready, app name:', app.getName());
  });
  sendLog('log', '[APP][setName] setName success');
  sendLog('log', '[APP][getName]', app.getName());
  testAppGetPath();
  mainWindow = new LynxWindow();
  return mainWindow;
}

export const loadFile = async (appPath: string) => {
  mainWindow = await createWindow();
  mainWindow.loadFile(appPath);
  mainWindow.show();

  // mainWindow 与 LynxView 已就绪, 把初始化之前缓存的日志按序发送
  logChannelReady = true;
  flushPendingLogs();

  // 窗口已就绪: 重定向 console 输出到渲染层 LogPanel, 主进程 console 日志可见
  installConsoleForward();

  // 窗口事件监听: 延迟 2 秒注册(等待窗口与渲染层完全就绪), 之后只监听用户对
  // 窗口的操作(最小化/最大化/全屏/拖拽缩放/失焦/显隐等), 触发后经 sendGlobalEvent
  // 推送给页面做显示。
  setTimeout(() => {
    registerWinEventListeners();
  }, 2000);

  // ── app 生命周期/事件监听测试 (日志格式与 [APP][setName] 对齐) ──
  // 说明: 事件监听改为由 AppModulePage 按钮触发注册(app.on), 避免重复监听。

  // 桥接主线程: 处理来自 Lynx UI 的 bridge 调用, 分发到 testDemo 的对应测试方法
  // @ts-ignore -lynx-invoke 为 Lynxtron 内部事件名
  mainWindow.on(
    '-lynx-invoke',
    async (callback: BridgeEventCallback, name: string, data: unknown) => {
      sendLog('log', '[default_app] bridge call:', name, data);
      // update 相关接口 (checkAppUpdate / showUpdateDialog / loadProduct) 由
      // lynx-window.ts 直接调用 AppGallery Kit binding 处理, 这里跳过以免重复 sendReply。
      if (name === 'checkAppUpdate' || name === 'showUpdateDialog' || name === 'loadProduct') {
        return;
      }
      // 剪贴板写操作: 由 LogPanel 的复制按钮调用
      if (name === 'writeClipboard') {
        const d = (data ?? {}) as { text?: unknown };
        if (typeof d.text !== 'string' || !d.text) {
          callback.sendReply({ ok: false, error: 'text must be a non-empty string' });
          return;
        }
        try {
          clipboard.writeText(d.text);
          callback.sendReply({ ok: true });
        } catch (e) {
          sendLog('error', '[default_app] writeClipboard failed:', e);
          callback.sendReply({ ok: false, error: String(e) });
        }
        return;
      }
      // App module 接口测试(由 AppModulePage 按钮触发, 日志格式 [APP][xxx])
      const appFn = APP_TEST_FNS[name];
      if (appFn) {
        try {
          await appFn(data);
          callback.sendReply({ ok: true, data: null });
        } catch (e) {
          sendLog('error', '[default_app]', name, 'failed:', e);
          callback.sendReply({ ok: false, error: String(e) });
        }
        return;
      }
      const fns = await ensureTestFns();
      const fn = fns[name];
      if (!fn) {
        sendLog('error', '[default_app] unknown method:', name);
        callback.sendReply({ ok: false, error: `unknown method: ${name}` });
        return;
      }
      try {
        const result = await fn();
        callback.sendReply({ ok: true, data: result });
      } catch (e) {
        sendLog('error', '[default_app]', name, 'failed:', e);
        callback.sendReply({ ok: false, error: String(e) });
      }
    }
  );
};
