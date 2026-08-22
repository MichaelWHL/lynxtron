// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// 轻量日志 store: 提供全局 log 方法, 供 UI 任意位置调用并把日志渲染到页面 LogPanel。
// 同时 LogPanel 也订阅主进程通过 bridge 推送的日志, 达到浏览器 devtool console 的效果。

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  level: LogLevel;
  text: string;
  time: string;
}

type Listener = (entries: LogEntry[]) => void;

const listeners: Listener[] = [];
let entries: LogEntry[] = [];
let seq = 0;

const MAX_ENTRIES = 500;

function fmtTime(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a === null) return 'null';
  if (a === undefined) return 'undefined';
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a);
    } catch {
      /* circular etc. */
    }
  }
  return String(a);
}

function push(level: LogLevel, args: unknown[]): void {
  const text = args.map(stringifyArg).join(' ');
  entries = [
    ...entries.slice(-(MAX_ENTRIES - 1)),
    { id: ++seq, level, text, time: fmtTime() },
  ];
  for (const l of listeners) l(entries);
}

/** 记录普通日志, 渲染到页面 LogPanel */
export function log(...args: unknown[]): void {
  push('log', args);
}

/** 记录 info 日志, 渲染到页面 LogPanel */
export function logInfo(...args: unknown[]): void {
  push('info', args);
}

/** 记录 warn 日志, 渲染到页面 LogPanel */
export function logWarn(...args: unknown[]): void {
  push('warn', args);
}

/** 记录 error 日志, 渲染到页面 LogPanel */
export function logError(...args: unknown[]): void {
  push('error', args);
}

/** 记录测试通过日志(info 级), 自动加 [PASS] 标记, 便于在 Console 面板一眼识别 */
export function logPass(...args: unknown[]): void {
  push('info', ['[PASS]', ...args]);
}

/** 记录测试失败日志(error 级), 自动加 [FAIL] 标记, Console 面板中显示为红色 */
export function logFail(...args: unknown[]): void {
  push('error', ['[FAIL]', ...args]);
}

/** 清空全部日志 */
export function clearLogs(): void {
  entries = [];
  for (const l of listeners) l(entries);
}

/** 订阅日志变更, 返回取消订阅函数。订阅时会立即回调一次当前全部日志 */
export function subscribeLogs(listener: Listener): () => void {
  listeners.push(listener);
  listener(entries);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}
