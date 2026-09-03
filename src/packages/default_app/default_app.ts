// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { app, clipboard, LynxWindow } from "lynxtron";
import { BridgeEventCallback, ensureTestFns, safeStringify } from './testModules/zf/utils.js';
import { runSphTests } from './testModules/sph/WindowTestIndex.js';

let mainWindow: LynxWindow | null = null;

// The currently loaded app path; passed to runSphTests by runWindowManagerTests.
let currentAppPath: string | null = null;
// Log channel ready flag: set to true after the renderer LogPanel registers the bridge-log listener and reports ready.
let logChannelReady = false;

// Pending log queue: caches logs produced before mainWindow is ready, in enqueue order.
const pendingLogs: Array<{ level: 'log' | 'info' | 'warn' | 'error'; text: string }> = [];

// Flush the cached logs to the renderer LogPanel in enqueue order.
function flushPendingLogs(): void {
  if (!mainWindow || !logChannelReady) return;
  const logs = pendingLogs.splice(0);
  for (const l of logs) {
    try {
      mainWindow.sendGlobalEvent('bridge-log', { level: l.level, text: l.text, from: 'main' });
    } catch {
      // ignore send errors
    }
  }
}

// Shared log sender: cache logs while mainWindow is not initialized, send them in order once ready.
function sendLog(level: 'log' | 'info' | 'warn' | 'error', ...args: unknown[]): void {
  const text = args.map(safeStringify).join(' ');
  if (mainWindow && logChannelReady) {
    try {
      mainWindow.sendGlobalEvent('bridge-log', { level, text, from: 'main' });
    } catch {
      // ignore send errors
    }
  } else {
    pendingLogs.push({ level, text });
  }
}

// After window initialization, forward the main process console.log/warn/error to the renderer LogPanel,
// so console output from main-process modules like testDemo.ts is also visible in the page LogPanel.
// Note: only rewrite after loadFile (window ready) — the window initialization phase depends on
// console output at the lower layers; rewriting earlier would break window initialization.
let consoleForwardInstalled = false;
function installConsoleForward(): void {
  if (consoleForwardInstalled) return;
  consoleForwardInstalled = true;
  const raw = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  // NOTE: these Chinese keywords intentionally match the summary lines emitted by the
  // zf test modules (e.g. testModules/zf/testDemo.ts); they must stay in Chinese and in
  // sync with those modules' output, otherwise the [PASS]/[FAIL] summary detection below breaks.
  const SUMMARY_KEYS = ['完成:', '加载成功', '写入成功', '返回有效', '编码均正常', '监听器注册/注销流程完成', '位图往返', '测试通过', '测试失败:', '结论:'];
  console.log = (...args: unknown[]) => {
    const text = args.map(safeStringify).join(' ');
    const isSummary = SUMMARY_KEYS.some((k) => text.includes(k));
    if (text.includes('[PASS]') && isSummary) {
      sendLog('info', ...args);
    } else {
      sendLog('log', ...args);
    }
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

// All path names enumerated by app.getPath() (aligned with Electron app.getPath).
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

/** Safely read app.getPath(name), returning an error text on failure. */
function safeGetPath(name: string): string {
  try {
    return app.getPath(name as never);
  } catch (e) {
    return 'ERROR: ' + String(e);
  }
}

/** app.getPath() OHOS path enumeration test, log format aligned with [APP][setName]. */
function testAppGetPath(): void {
  sendLog('log', '═══════ app.getPath() OHOS test ═══════');
  // Source: use appData as the baseline source path.
  sendLog('log', `[APP][getPath] appData(source) -> ${safeGetPath('appData')}`);
  for (const name of APP_PATH_NAMES) {
    sendLog('log', `[APP][getPath] ${name.padEnd(12)} -> ${safeGetPath(name)}`);
  }
  // Derived-path verification.
  sendLog('log', '[APP][getPath] ═══ done ═══');
}

// Names of registered app event listeners, to avoid duplicate listeners from repeated button clicks.
const registeredAppEvents = new Set<string>();

// -- Frame timing monitor (win.on('frame-timings') / win.setFrameTimingsEnabled) --
let frameTimingsRegistered = false;

/** Handle the win frame-timings event, aggregate stats, and push them to the UI live FPS board. */
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
    fps: timings.length, // frame count within the sampling period ≈ FPS
    avgMs: Number((totalNs / timings.length / 1e6).toFixed(2)),
    maxMs: Number((maxNs / 1e6).toFixed(2)),
    frames: timings.length,
  };
  try {
    mainWindow?.sendGlobalEvent('fps-stats', stats);
  } catch {
    // ignore send errors
  }
};

// -- Window event listener test (win.on('blur'|'focus'|...) ) --
// The recent "window events" work added an ArkTS→C++→JS window state event pipeline. Here we
// register listeners in the main process and push each trigger to the renderer
// GlobalEventEmitter('win-event') for the page counters.
const WIN_EVENTS = [
  'blur', 'focus', 'show', 'hide', 'closed',
  'minimize', 'restore', 'maximize', 'unmaximize',
  'enter-full-screen', 'leave-full-screen',
  'resize', 'resized', 'move', 'moved', 'will-resize',
] as const;

const wiredWinEvents = new WeakSet<LynxWindow>();

// Register listeners for all WIN_EVENTS on the given window once; returns the number of listeners added.
function registerWinEventListeners(win: LynxWindow | null): number {
  if (!win || wiredWinEvents.has(win)) {
    return 0;
  }
  wiredWinEvents.add(win);
  let newly = 0;
  for (const name of WIN_EVENTS) {
    newly++;
    (win as any).on(name, (...args: unknown[]) => {
      const detail = safeStringify(args.slice(1));
      sendLog('log', `[WIN][events] win.on("${name}") fired${detail && detail !== '[]' ? ' ' + detail : ''}`);
      try {
        win.sendGlobalEvent('win-event', { event: name, detail, ts: Date.now() });
      } catch {
        // ignore send errors
      }
    });
  }
  sendLog('log', `[WIN][events] registered ${newly} window event listeners`);
  return newly;
}

/** App module API test functions: triggered from AppModulePage buttons via bridge. */
const APP_TEST_FNS: Record<string, (data?: unknown, win?: LynxWindow) => void | Promise<void>> = {
  // -- proactive calls --
  testAppSetName() {
    app.setName('Xingtu API test_runtime_1');
    sendLog('log', '[APP][setName] setName success');
    sendLog('log', '[APP][getName]', app.getName());
  },
  testAppGetName() {
    sendLog('log', '[APP][getName]', app.getName());
  },
  testAppGetPath() {
    testAppGetPath();
  },
  // Remove the OHOS native window frame: equivalent to setWindowDecorVisible(false) + setWindowTitleButtonVisible(false,false,false)
  testAppFrameless() {
    const win = mainWindow;
    if (!win) {
      sendLog('warn', '[APP][frameless] mainWindow not ready');
      return;
    }
    win.setWindowButtonVisibility(false);
    sendLog('log', '[APP][frameless] OHOS native decorations hidden (main window)');
  },
  testAppQuit() {
    sendLog('log', '[APP][quit] app.quit() called');
    app.quit();
  },
  // Create a new window with the same content as the main window
  testNewWindow(data) {
    const opts = (data ?? {}) as { width?: number; height?: number };
    const width = opts.width ?? 800;
    const height = opts.height ?? 600;
    const win = new LynxWindow({ fullscreen: true, show: true, width: width, height: height });
    // Load the same app bundle as the main window
    if (currentAppPath) {
      win.loadFile(currentAppPath);
    }
    win.show();
    // Wire the same bridge and window event listeners as the main window
    setupWindowBridge(win);
    registerWinEventListeners(win);
    const id = String((win as unknown as { id?: number }).id ?? '?');
    sendLog('log', `[APP][newWindow] new window created ${width}x${height} id=${id} (same content as main window)`);
  },

  // -- events/callbacks --
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
      sendLog('log', '[APP][open-url] open-url listener registered');
    } else {
      sendLog('log', '[APP][open-url] open-url listener already exists');
    }
  },
  testAppBeforeQuit() {
    if (!registeredAppEvents.has('before-quit')) {
      registeredAppEvents.add('before-quit');
      app.on('before-quit', () => {
        sendLog('log', '[APP][before-quit] before-quit event fired');
      });
      sendLog('log', '[APP][before-quit] before-quit listener registered');
    } else {
      sendLog('log', '[APP][before-quit] before-quit listener already exists');
    }
  },
  testAppWindowAllClosed() {
    if (!registeredAppEvents.has('window-all-closed')) {
      registeredAppEvents.add('window-all-closed');
      app.on('window-all-closed', () => {
        sendLog('log', '[APP][window-all-closed] window-all-closed event fired, calling app.quit()');
        app.quit();
      });
      sendLog('log', '[APP][window-all-closed] window-all-closed listener registered (app.quit() when all closed)');
    } else {
      sendLog('log', '[APP][window-all-closed] window-all-closed listener already exists');
    }
  },

  // Frame timing monitor switch: data = { enabled: boolean }, stats pushed to the UI board via the 'fps-stats' event
  testFrameTimings(data) {
    const win = mainWindow;
    if (!win) {
      sendLog('warn', '[APP][frame-timings] mainWindow not ready');
      return;
    }
    const enabled = Boolean((data as { enabled?: unknown } | undefined)?.enabled);
    if (enabled) {
      if (!frameTimingsRegistered) {
        frameTimingsRegistered = true;
        win.on('frame-timings', onFrameTimings);
      }
      win.setFrameTimingsEnabled(true, 1000);
      sendLog('log', '[APP][frame-timings] frame timing monitor enabled (win.on("frame-timings"))');
    } else {
      win.setFrameTimingsEnabled(false);
      sendLog('log', '[APP][frame-timings] frame timing monitor stopped');
    }
  },

  // -- bridge API tests --
  // win.sendGlobalEvent: main process actively pushes a custom global event to the renderer
  testSendGlobalEvent(data, win) {
    const msg = (data as { msg?: unknown } | undefined)?.msg ?? 'hello-from-main';
    const target = win ?? mainWindow;
    target?.sendGlobalEvent('yb-bridge-test', { type: 'sendGlobalEvent', detail: String(msg), ts: Date.now() });
    sendLog('log', '[BRIDGE][sendGlobalEvent] win.sendGlobalEvent("yb-bridge-test") called');
  },
  // win.on("-lynx-invoke"): bridge.call is delivered through exactly this event; reaching here means the listener works
  testLynxInvoke(data, win) {
    const msg = (data as { msg?: unknown } | undefined)?.msg ?? '(empty)';
    sendLog('log', `[BRIDGE][lynx-invoke] bridge.call received, msg=${safeStringify(msg)}`);
    const target = win ?? mainWindow;
    target?.sendGlobalEvent('yb-bridge-test', { type: 'lynx-invoke', detail: safeStringify(msg), ts: Date.now() });
  },

  // Window management tests: triggered by the SPH WindowPage button, delegated to testModules/sph/index.ts
  async runWindowManagerTests() {
    sendLog('log', '[APP][runWindowManagerTests] SPH WindowManager tests triggered');
    await runSphTests(currentAppPath ?? undefined);
  },
};

/**
 * Wire the renderer bridge events for the given window:
 *  - '-lynx-invoke': bridge.call(channel, data, cb) dispatched to APP_TEST_FNS
 *  - '-lynx-message': bridge.send(channel, data) forwarded back to this window's renderer
 */
function setupWindowBridge(win: LynxWindow): void {
  // @ts-ignore -lynx-invoke is a Lynxtron internal event name
  win.on(
    '-lynx-invoke',
    async (callback: BridgeEventCallback, name: string, data: unknown) => {
      sendLog('log', '[default_app] bridge call:', name, data);
      // The update-related APIs (checkAppUpdate / showUpdateDialog / loadProduct) are handled
      // by the per-window _init in lynx-window.ts; skip them here to avoid duplicate sendReply.
      if (name === 'checkAppUpdate' || name === 'showUpdateDialog' || name === 'loadProduct') {
        return;
      }
      // Clipboard write: invoked by the LogPanel copy button
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
      // The renderer LogPanel has registered the bridge-log listener and reported ready; flush the cached pre-initialization logs now
      if (name === 'logChannelReady') {
        logChannelReady = true;
        flushPendingLogs();
        callback.sendReply({ ok: true });
        return;
      }
      // App module API tests (triggered by AppModulePage buttons, log format [APP][xxx])
      const appFn = APP_TEST_FNS[name];
      if (appFn) {
        try {
          await appFn(data, win);
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

  // bridge.send(channel, data) triggers -lynx-message, forwarded back to this window's renderer
  (win as any).on('-lynx-message', (channel: string, data: unknown) => {
    sendLog('log', `[BRIDGE][lynx-message] channel="${channel}" data=${safeStringify(data)}`);
    try {
      win.sendGlobalEvent('yb-bridge-test', {
        type: 'lynx-message',
        channel,
        detail: safeStringify(data),
        ts: Date.now(),
      });
    } catch {
      // ignore send errors
    }
  });
}

// Create the main window: set the app name, run app API smoke tests, and construct the LynxWindow.
async function createWindow() {
  app.setName("Xingtu API test_dev");
  await app.whenReady().then(() => {
    sendLog('log', '[APP][whenReady] ready, app name:', app.getName());
  });
  sendLog('log', '[APP][setName] setName success');
  sendLog('log', '[APP][getName]', app.getName());
  testAppGetPath();
  //
  APP_TEST_FNS.testAppOpenUrl()
  APP_TEST_FNS.testAppBeforeQuit()
  APP_TEST_FNS.testAppWindowAllClosed()

  mainWindow = new LynxWindow({
    width: 2000,
    height: 1200
  });
  return mainWindow;
}

// Entry point for the host: create and show the main window and load the app bundle from appPath.
export const loadFile = async (appPath: string) => {
  currentAppPath = appPath;
  mainWindow = await createWindow();
  mainWindow.loadFile(appPath);
  mainWindow.show();

  // The log channel is truly ready only when the renderer reports so (see the logChannelReady handling below):
  // at this point the LynxView has not finished loading the bundle and the bridge-log listener is not
  // registered yet, so flushing now would be dropped. Therefore logChannelReady is not set here;
  // pre-initialization logs keep waiting in pendingLogs.

  // Window ready: redirect console output to the renderer LogPanel so main-process console logs are visible
  installConsoleForward();

  // Window event listeners: register after a 2s delay (wait for the window and renderer to be fully
  // ready), then only listen for user window operations (minimize/maximize/fullscreen/drag-resize/
  // focus loss/show-hide etc.) and push them to the page via sendGlobalEvent for display.
  setTimeout(() => {
    registerWinEventListeners(mainWindow);
  }, 2000);

  // -- app lifecycle / event listener tests (log format aligned with [APP][setName]) --
  // Note: event listeners are now registered from AppModulePage buttons (app.on) to avoid duplicates.

  // Wire the bridge for the main window (-lynx-invoke dispatch + -lynx-message forwarding)
  setupWindowBridge(mainWindow);
};
