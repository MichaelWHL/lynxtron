// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useState } from '@lynx-js/react';
import { logInfo, logWarn, logPass, logFail } from '../../utils/log';

// ── AppGallery Kit update 相关接口(最近三笔提交新增) ──
// checkAppUpdate: 检查应用更新 → { updateAvailable: bool, ... }
// showUpdateDialog: 弹出更新对话框 → { resultCode: number }
// loadProduct: 加载产品视图 → { success: bool, errorCode?, errorMessage? }
const UPDATE_APIS: Array<{ name: string; label: string; desc: string }> = [
  { name: 'checkAppUpdate', label: 'checkAppUpdate()', desc: '检查应用更新, 返回 updateAvailable' },
  { name: 'showUpdateDialog', label: 'showUpdateDialog()', desc: '弹出更新对话框, 返回 resultCode' },
  { name: 'loadProduct', label: 'loadProduct()', desc: '加载产品视图, 返回 success' },
];

function stringifyResult(res: unknown): string {
  if (res === null) return 'null';
  if (res === undefined) return 'undefined';
  if (typeof res === 'string') return res;
  try {
    return JSON.stringify(res);
  } catch {
    return String(res);
  }
}

/** yb module: update 相关接口测试页 */
export default function YbModulePage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, { trigger: number; success: number }>>({});

  useEffect(() => {
    logInfo('[YB] yb module 页面已加载, 待测试 update 相关接口');
  }, []);

  const bump = (name: string, key: 'trigger' | 'success') => {
    setCounts((prev) => {
      const cur = prev[name] ?? { trigger: 0, success: 0 };
      return { ...prev, [name]: { ...cur, [key]: cur[key] + 1 } };
    });
  };

  const runUpdateApi = (name: string) => {
    if (busy) {
      logWarn(`[YB] 上一次调用「${busy}」尚未返回, 请稍候`);
      return;
    }
    setBusy(name);
    bump(name, 'trigger');
    logInfo(`[YB] ▶ 调用 update 接口: ${name}`);

    NativeModules.bridge.call(name, {}, (res: any) => {
      setBusy(null);
      const text = stringifyResult(res);
      if (res && res.error === true) {
        logFail(`[YB] ✗ ${name} 失败: ${res.message ?? text}`);
      } else {
        bump(name, 'success');
        logPass(`[YB] ✓ ${name} 完成: ${text}`);
      }
    });
  };

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">yb module · update 接口测试</text>
      </view>
      <view className="testGrid">
        {UPDATE_APIS.map((t) => {
          const c = counts[t.name] ?? { trigger: 0, success: 0 };
          return (
            <view className="testCard" key={t.name}>
              <view className="testButton" bindtap={() => runUpdateApi(t.name)}>
                <view className="testButtonDot" />
                <text className="testButtonText">{t.label}</text>
                <text className="testButtonArrow">›</text>
              </view>
              <text className="testCardDesc">{t.desc}</text>
              <text className="testCardCount">触发 {c.trigger} 次 · 成功 {c.success} 次</text>
            </view>
          );
        })}
      </view>
    </view>
  );
}
