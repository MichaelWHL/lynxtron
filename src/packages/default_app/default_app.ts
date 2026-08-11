// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.



import { app, LynxWindow, clipboard } from 'lynxtron';

let mainWindow: LynxWindow | null = null;

async function createWindow() {
  app.setName("LYNXTRON-ZLL")
  await app.whenReady().then(()=>{
    console.log("app.whenReady: is ok:",app.getName())
  });
  console.log("app.getName():",app.getName())
  const mainWindow = new LynxWindow({
    width: 1200,
    height: 800,
  });

  return mainWindow;
}

// bridge 调用回调类型: sendReply 用于把结果返回给 Lynx UI 侧
type BridgeEventCallback = { sendReply: (result?: unknown) => void };

type TestFn = () => Promise<void> | void;

// testDemo.ts 中暴露的全部测试方法名
const TEST_FN_NAMES = [
  'testOpenExternal',
  'testOpenPath',
  'testShowOpenDialog',
  'testShowSaveDialog',
  'testCreateFromPath',
  'testCreateFromBitmap',
  'testOnlock',
  'testFetchJson',
  // ── poll() 替代 select() 回归测试 (node_bindings_harmony.cc PollEvents) ──
  'testPollHttpBasic',
  'testPollHttpConcurrent',
  'testPollTimerPrecision',
  'testPollTimerAndIO',
  'testPollConnectRefused',
  'testPollRequestTimeout',
  'testPollHttpLoop',
  'testPollNoTimerIO',
  //
  'testGetPrimaryDisplay',
  "testClipboardWriteText"
] as const;

let testFns: Record<string, TestFn> | null = null;

async function ensureTestFns(): Promise<Record<string, TestFn>> {
  if (!testFns) {
    const mod: Record<string, unknown> = await import('./testDemo.js');
    testFns = {};
    for (const name of TEST_FN_NAMES) {
      if (typeof mod[name] === 'function') {
        testFns[name] = mod[name] as TestFn;
      }
    }
  }
  return testFns;
}

function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s;
  } catch {
    return String(v);
  }
}

export const loadFile = async (appPath: string) => {
  mainWindow = await createWindow();
  mainWindow.show();
  mainWindow.loadFile(appPath);

  // devtool 式日志转发: 把主进程 console 输出实时推送到 Lynx UI 的 LogPanel
  const sendLog = (level: 'log' | 'warn' | 'error', ...args: unknown[]) => {
    const text = args.map(safeStringify).join(' ');
    try {
      mainWindow?.sendGlobalEvent('bridge-log', { level, text, from: 'main' });
    } catch {
      // 窗口尚未就绪时忽略
    }
  };
  console.log = (...args: unknown[]) => {
    sendLog('log', ...args);
  };
  console.warn = (...args: unknown[]) => {
    sendLog('warn', ...args);
  };
  console.error = (...args: unknown[]) => {
    sendLog('error', ...args);
  };

  // 桥接主线程: 处理来自 Lynx UI 的 bridge 调用, 分发到 testDemo 的对应测试方法
  // @ts-ignore -lynx-invoke 为 Lynxtron 内部事件名
  mainWindow.on(
    '-lynx-invoke',
    async (callback: BridgeEventCallback, name: string, data: unknown) => {
      console.log('[default_app] bridge call:', name, data);
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
          console.error('[default_app] writeClipboard failed:', e);
          callback.sendReply({ ok: false, error: String(e) });
        }
        return;
      }
      const fns = await ensureTestFns();
      const fn = fns[name];
      if (!fn) {
        console.error('[default_app] unknown method:', name);
        callback.sendReply({ ok: false, error: `unknown method: ${name}` });
        return;
      }
      try {
        const result = await fn();
        callback.sendReply({ ok: true, data: result });
      } catch (e) {
        console.error('[default_app]', name, 'failed:', e);
        callback.sendReply({ ok: false, error: String(e) });
      }
    }
  );

};
