// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// lynx.getJSModule() / lynx.registerModule() 功能验证用例 (鸿蒙版)
// 与 win 版 jsModuleTest.ts 逻辑一致, 用于对比两端日志。
// 触发方式: 打开页面 1.2s 后自动跑一次, 或点击 "JSModule" 按钮。
// 输出: 页面 Console 面板, tag = JM。

import { logInfo, logError } from '../../utils/log';

const TAG = 'JM';

function isObject(v: unknown): boolean {
  return v !== null && typeof v === 'object';
}

/** 执行全部用例 */
export function testJSModule(): void {
  const lynxAny = lynx as any;
  logInfo(TAG, '═══ getJSModule 测试开始 ═══');

  if (typeof lynxAny.getJSModule !== 'function') {
    logError(TAG, '✗ lynx.getJSModule 不可用, type=' + typeof lynxAny.getJSModule);
    return;
  }

  // 用例1: 内置注册模块 GlobalEventEmitter (default_app 日志通道依赖它)
  try {
    const g = lynxAny.getJSModule('GlobalEventEmitter');
    if (isObject(g)) {
      logInfo(TAG, '用例1 ✅ getJSModule(GlobalEventEmitter) 是对象, addListener=' + typeof g.addListener);
    } else {
      logError(TAG, '用例1 ✗ getJSModule(GlobalEventEmitter) = ' + String(g) + ' (应为对象)');
    }
  } catch (e) {
    logError(TAG, '用例1 ✗ 抛异常: ' + String(e));
  }

  // 用例2: 未注册的名字 → undefined (文档: "如果 name 未被注册, 返回 undefined")
  try {
    const u = lynxAny.getJSModule('sq_definitely_not_registered');
    if (u === undefined) {
      logInfo(TAG, '用例2 ✅ getJSModule(未注册名) = undefined');
    } else {
      logError(TAG, '用例2 ✗ getJSModule(未注册名) = ' + JSON.stringify(u) + ' (应为 undefined)');
    }
  } catch (e) {
    logError(TAG, '用例2 ✗ 抛异常: ' + String(e));
  }

  // 用例3: registerModule 后 getJSModule 返回同一对象 (文档示例)
  try {
    const foo = { tag: 'sq-jsmodule-test', n: 42 };
    lynxAny.registerModule('sq_foo', foo);
    const got = lynxAny.getJSModule('sq_foo');
    if (got === foo) {
      logInfo(TAG, '用例3 ✅ registerModule+getJSModule 同一引用, got.tag=' + got.tag + ' n=' + got.n);
    } else {
      logError(TAG, '用例3 ✗ 引用不一致, got=' + JSON.stringify(got));
    }
  } catch (e) {
    logError(TAG, '用例3 ✗ 抛异常: ' + String(e));
  }

  // 用例4: 同名再次 register 覆盖旧模块
  try {
    const bar = { tag: 'sq-jsmodule-test-2' };
    lynxAny.registerModule('sq_foo', bar);
    const got = lynxAny.getJSModule('sq_foo');
    logInfo(TAG, '用例4 ✅ 同名覆盖后 getJSModule 返回新对象: ' + (got === bar ? '一致' : '不一致!'));
  } catch (e) {
    logError(TAG, '用例4 ✗ 抛异常: ' + String(e));
  }

  logInfo(TAG, '═══ getJSModule 测试结束 ═══');
}
