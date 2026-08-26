// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// lynx.addFont() 功能验证用例 (鸿蒙版)
// 支持用户从页面输入 font-family 与 FONT_SRC(字体 URL), 替代硬编码字体地址。
// 验证思路: addFont(data URI/URL) 同步注册 → 轮询测量 #ft-custom vs #ft-default 宽度,
//           等异步加载完成后再下结论(不依赖固定延时)。
// 每条用例以 [PASS] / [FAIL] 标记。

import { logInfo, logPass, logFail } from '../../utils/log';

const TAG = 'FT';

// 兜底默认字体地址(用户未输入时使用)
const DEFAULT_FONT_SRC = "url('http://192.168.19.183:8787/fonts/Bungee-Regular.ttf')";

// 页面输入区写入的字体源(addFont 卡片输入框 bindinput 会更新这里); 字体名固定 sq-font
export const fontInput: AddFontOptions = {
  src: '',
};

interface AddFontOptions {
  /** 字体地址, 如 url('http://.../xx.ttf') 或 data: URI */
  src?: string;
  /** 注册的 font-family 名 */
  fontFamily?: string;
}

/** 验证 lynx.addFont 是否真正生效; src/family 由页面输入传入 */
export function testAddFont(opts?: AddFontOptions, onReady?: () => void): void {
  const src = opts?.src?.trim() || DEFAULT_FONT_SRC;
  const family = 'sq-font'; // 字体名固定
  const lynxAny = lynx as any;
  logInfo(TAG, '═══ addFont 验证开始 ═══');
  logInfo(TAG, '   font-family=' + family + '  src=' + src);

  if (typeof lynxAny.addFont !== 'function') {
    logFail(TAG, 'lynx.addFont 不可用, type=' + typeof lynxAny.addFont);
    return;
  }

  // 用例1: 缺 font-family → 应抛异常
  try {
    lynxAny.addFont({ src }, () => { });
    logFail(TAG, '用例1 缺 font-family 未抛异常');
  } catch (e) {
    logPass(TAG, '用例1 缺 font-family 抛异常');
  }

  // 用例2: 缺 src → 应抛异常
  try {
    lynxAny.addFont({ 'font-family': family }, () => { });
    logFail(TAG, '用例2 缺 src 未抛异常');
  } catch (e) {
    logPass(TAG, '用例2 缺 src 抛异常');
  }

  // 用例3: 加载 + 轮询测量
  logInfo(TAG, '用例3 提交 addFont…');
  try {
    lynxAny.addFont({ 'font-family': family, src }, (e?: any) => {
      if (e) {
        logFail(TAG, '用例3 回调带错误: ' + String(e));
        return;
      }
      logInfo(TAG, '用例3 回调触发(同步)');
      // 先调 onReady, 让 #ft-custom 元素在 addFont 后才出现(先注册后声明)
      if (onReady) onReady();
      // 为防止字体注册/渲染回调时机不对, 延迟 2s 后再测量
      logInfo(TAG, '延迟 2s 后开始轮询测量');
      setTimeout(() => pollFontWidth(0), 2000);
    });
  } catch (e) {
    logFail(TAG, '用例3 抛异常: ' + String(e));
  }
}

/** 轮询测量 #ft-custom(自定义字体) vs #ft-default(默认字体) 宽度
 *  先等 #ft-custom 元素动态渲染完成(re-render 异步),
 *  节点都选中后才测宽度; 失败则下一轮重试 */
function pollFontWidth(attempt: number): void {
  const MAX = 20;          // 允许更多次: 等元素动态出现
  const INTERVAL = 300;
  const done = (msg: string, isPass: boolean) => { if (isPass) logPass(TAG, msg); else logFail(TAG, msg); };

  // 每轮新的局部变量
  let m1: any = null;
  let m2: any = null;
  let m1fail = false;
  let m2fail = false;
  const tryNext = () => {
    // 两个都执行完成后才进一步
    if (!(m1 !== null || m1fail)) return;
    if (!(m2 !== null || m2fail)) return;
    // 有任一查询失败(节点还没就绪) → 下一轮重试
    if (m1fail || m2fail) {
      if (attempt + 1 >= MAX) {
        done('结论: 轮询 ' + MAX + ' 次后元素未就绪(无法测量)', false);
        return;
      }
      m1 = m2 = null; m1fail = m2fail = false;
      logInfo(TAG, '元素未就绪, ' + (attempt + 1) + '/' + MAX + ' 轮重试…');
      setTimeout(() => pollFontWidth(attempt + 1), INTERVAL);
      return;
    }
    // 两个都拿到 → 测量
    const diff = Math.abs((m1 as any).width - (m2 as any).width);
    logInfo(TAG, '测量[' + (attempt + 1) + ']: 自定义=' + (m1 as any).width.toFixed(1) +
      ' 默认=' + (m2 as any).width.toFixed(1) + ' 差=' + diff.toFixed(2));
    if (diff > 0.5) {
      done('结论: addFont 字体已生效', true);
    } else if (attempt + 1 >= MAX) {
      done('结论: 轮询 ' + MAX + ' 次后宽度仍无差异 → 字体未生效', false);
    } else {
      logInfo(TAG, '宽度无差异, ' + (attempt + 1) + '/' + MAX + ' 轮重试…');
      setTimeout(() => pollFontWidth(attempt + 1), INTERVAL);
    }
  };
  try {
    lynx.createSelectorQuery()
      .select('#ft-custom').invoke({
        method: 'boundingClientRect',
        success: (a: any) => { m1 = a; tryNext(); },
        fail: (r: any) => { m1fail = true; logInfo(TAG, '测量 #ft-custom 失败 code=' + (r && r.code) + ' 节点未就绪'); tryNext(); }
      })
      .select('#ft-default').invoke({
        method: 'boundingClientRect',
        success: (b: any) => { m2 = b; tryNext(); },
        fail: (r: any) => { m2fail = true; logInfo(TAG, '测量 #ft-default 失败 code=' + (r && r.code)); tryNext(); }
      })
      .exec();
  } catch (err) {
    logFail(TAG, '测量抛异常: ' + String(err));
  }
}