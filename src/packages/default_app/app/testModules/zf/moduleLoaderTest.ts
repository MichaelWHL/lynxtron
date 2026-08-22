// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// lynx.getModuleLoader().load() 功能验证用例 (鸿蒙版)
// 原生模块 lynxtron_hello 由 C++ (src/shell/api/lynx_view/module/lynxtron_hello_native.cc)
// 通过 NODE_API_MODULE 注册进 primjs napi 全局模块链表, 由 getModuleLoader().load() 加载。
// 触发方式: 打开页面 1.5s 后自动跑一次, 或点击 "ModuleLoader" 按钮。
// 输出: 页面 Console 面板, tag = ML。

import { logInfo, logError } from '../../utils/log';

const TAG = 'ML';

function isObject(v: unknown): boolean {
  return v !== null && typeof v === 'object';
}

/** 执行全部用例 */
export function testModuleLoader(): void {
  const lynxAny = lynx as any;
  logInfo(TAG, '═══ getModuleLoader().load() 测试开始 ═══');

  let loader: any;
  try {
    loader = lynxAny.getModuleLoader();
  } catch (e) {
    logError(TAG, '✗ lynx.getModuleLoader() 抛异常: ' + String(e));
    return;
  }

  if (!loader || typeof loader.load !== 'function') {
    logError(TAG, '✗ getModuleLoader() 返回异常: ' + JSON.stringify(loader) + ' (应有 load 方法)');
    return;
  }
  logInfo(TAG, '✓ getModuleLoader() 返回 loader, load=' + typeof loader.load + ', keys=' + Object.keys(loader).join(','));

  // 用例1: 加载原生模块 lynxtron_hello
  let mod: any = null;
  try {
    mod = loader.load('lynxtron_hello');
  } catch (e) {
    logError(TAG, '用例1 ✗ load("lynxtron_hello") 抛异常: ' + String(e));
  }
  if (isObject(mod)) {
    const keys = Object.keys(mod).join(',');
    logInfo(TAG, '用例1 ✅ load 返回对象, keys=[' + keys + ']');
  } else {
    logError(TAG, '用例1 ✗ load 结果 = ' + String(mod) + ' (应为对象)');
    logInfo(TAG, '═══ getModuleLoader().load() 测试结束(失败) ═══');
    return;
  }

  // 用例2: 模块常量 name / version
  try {
    const name = mod.name;
    const version = mod.version;
    logInfo(TAG, '用例2 ✅ name=' + String(name) + ' version=' + String(version));
  } catch (e) {
    logError(TAG, '用例2 ✗ 读取 name/version 抛异常: ' + String(e));
  }

  // 用例3: hello() 返回字符串
  try {
    const r = mod.hello();
    logInfo(TAG, '用例3 ✅ hello() = "' + String(r) + '"');
  } catch (e) {
    logError(TAG, '用例3 ✗ hello() 抛异常: ' + String(e));
  }

  // 用例4: add(40, 2) = 42
  try {
    const s = mod.add(40, 2);
    logInfo(TAG, '用例4 ✅ add(40, 2) = ' + String(s) + ' (应为 42)');
  } catch (e) {
    logError(TAG, '用例4 ✗ add() 抛异常: ' + String(e));
  }

  // 用例5: echo 往返 (数字 / 字符串)
  try {
    const n = mod.echo(123);
    const s = mod.echo('abc');
    logInfo(TAG, '用例5 ✅ echo(123)=' + String(n) + ' echo("abc")=' + String(s));
  } catch (e) {
    logError(TAG, '用例5 ✗ echo() 抛异常: ' + String(e));
  }

  // 用例6: 加载不存在的模块 → 抛异常 (验证 lookup 确实走 native 模块表)
  try {
    loader.load('lynxtron_definitely_not_exist');
    logError(TAG, '用例6 ✗ load(不存在) 未抛异常');
  } catch (e) {
    logInfo(TAG, '用例6 ✅ load(不存在) 抛异常: ' + String(e));
  }

  logInfo(TAG, '═══ getModuleLoader().load() 测试结束 ═══');
}
