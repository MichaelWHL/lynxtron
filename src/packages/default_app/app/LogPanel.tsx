// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useState } from '@lynx-js/react';
import { clearLogs, subscribeLogs, type LogEntry } from './log';

/**
 * devtool 式日志面板: 订阅全局 log store,
 * 把 UI 侧 log()/主进程推送的日志实时渲染到页面上。
 */
export default function LogPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeLogs(setEntries);
    return unsubscribe;
  }, []);

  // 把当前全部日志拼成纯文本, 通过主进程 clipboard 写入剪贴板
  const copyLogs = () => {
    const text = entries
      .map((e) => `[${e.time}] ${e.text}`)
      .join('\n');
    if (!text) return;
    NativeModules.bridge.call('writeClipboard', { text }, (res: any) => {
      if (res && res.ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    });
  };

  return (
    <view className="logPanel">
      <view className="logPanelHeader">
        <view className="logPanelTitleWrap">
          <text className="logPanelTitle">Console</text>
          {entries.length > 0 ? <text className="logCount">{entries.length}</text> : null}
        </view>
        <view className="logPanelActions">
          <view
            className={`logCopyButton ${copied ? 'logCopyButton-done' : ''}`}
            bindtap={() => copyLogs()}
          >
            <text className="logCopyButtonText">{copied ? '✓ 已复制' : '⧉ 复制'}</text>
          </view>
          <view className="logClearButton" bindtap={() => clearLogs()}>
            <text className="logClearButtonText">清除</text>
          </view>
        </view>
      </view>
      <scroll-view scroll-orientation="vertical" className="logPanelBody">
        {entries.map((e) => (
          <view key={e.id} className={`logLine logLine-${e.level}`}>
            <text className="logTime">{e.time}</text>
            <text className="logText">{e.text}</text>
          </view>
        ))}
        {entries.length === 0 ? (
          <text className="logEmpty">// 暂无日志, 点击上方按钮运行测试</text>
        ) : null}
      </scroll-view>
    </view>
  );
}
