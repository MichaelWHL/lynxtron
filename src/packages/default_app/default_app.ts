// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { app, clipboard, LynxWindow } from "lynxtron";
import { BridgeEventCallback, ensureTestFns, safeStringify } from './testModules/zf/utils.js';

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
// 注意: 不要重写全局 console.log —— 主进程底层依赖 console 输出, 重写会影响窗口初始化。
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

async function createWindow() {
  app.setName("醒图接口测试");
  await app.whenReady().then(() => {
    sendLog('log', '[APP][whenReady] ready, app name:', app.getName());
  });
  sendLog('log', '[APP][setName] setName success');
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

  // 桥接主线程: 处理来自 Lynx UI 的 bridge 调用, 分发到 testDemo 的对应测试方法
  // @ts-ignore -lynx-invoke 为 Lynxtron 内部事件名
  mainWindow.on(
    '-lynx-invoke',
    async (callback: BridgeEventCallback, name: string, data: unknown) => {
      sendLog('log', '[default_app] bridge call:', name, data);
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
