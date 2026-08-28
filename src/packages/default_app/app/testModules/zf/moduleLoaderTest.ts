// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// lynx.getModuleLoader().load() 功能验证用例 (鸿蒙版)
// 原生模块 lynxtron_hello 由 C++ (src/shell/api/lynx_view/module/lynxtron_hello_native.cc)
// 通过 NODE_API_MODULE 注册进 primjs napi 全局模块链表, 由 getModuleLoader().load() 加载。
// 触发方式: 打开页面 1.5s 后自动跑一次, 或点击 "ModuleLoader" 按钮。
// 输出: 页面 Console 面板, tag = ML。
// 每条用例以 [PASS] / [FAIL] 标记, 结尾输出整体结论。

import { log, logPass, logFail } from '../../utils/log';

const TAG = 'ML';

function isObject(v: unknown): boolean {
  return v !== null && typeof v === 'object';
}

/** 执行全部用例 */
export function testModuleLoader(): void {
  const lynxAny = lynx as any;
  let passed = 0;
  let failed = 0;
  const ok = (msg: string) => { passed++; log(TAG, '[PASS] ' + msg); };
  const bad = (msg: string) => { failed++; log(TAG, '[FAIL] ' + msg); };
  const summarize = () => {
    const total = passed + failed;
    if (failed === 0) logPass(TAG, '测试通过 (' + passed + '/' + total + ')');
    else logFail(TAG, '测试失败: 通过 ' + passed + '/' + total + ', 失败 ' + failed);
    log(TAG, '═══ getModuleLoader().load() 测试结束 ═══');
  };

  log(TAG, '═══ getModuleLoader().load() 测试开始 ═══');

  let loader: any;
  try {
    loader = lynxAny.getModuleLoader();
  } catch (e) {
    logFail(TAG, 'lynx.getModuleLoader() 抛异常: ' + String(e));
    summarize();
    return;
  }

  if (!loader || typeof loader.load !== 'function') {
    logFail(TAG, 'getModuleLoader() 返回异常: ' + JSON.stringify(loader) + ' (应有 load 方法)');
    summarize();
    return;
  }
  log(TAG, 'getModuleLoader() 返回 loader, load=' + typeof loader.load + ', keys=' + Object.keys(loader).join(','));

  // 用例1: 加载原生模块 lynxtron_hello
  let mod: any = null;
  try {
    mod = loader.load('lynxtron_hello');
  } catch (e) {
    bad('用例1 load("lynxtron_hello") 抛异常: ' + String(e));
  }
  if (isObject(mod)) {
    const keys = Object.keys(mod).join(',');
    ok('用例1 load 返回对象, keys=[' + keys + ']');
  } else {
    bad('用例1 load 结果 = ' + String(mod) + ' (应为对象)');
    summarize();
    return;
  }

  // 用例2: 模块常量 name / version
  try {
    const name = mod.name;
    const version = mod.version;
    ok('用例2 name=' + String(name) + ' version=' + String(version));
  } catch (e) {
    bad('用例2 读取 name/version 抛异常: ' + String(e));
  }

  // 用例3: hello() 返回字符串
  try {
    const r = mod.hello();
    if (typeof r === 'string') {
      ok('用例3 hello() = "' + String(r) + '"');
    } else {
      bad('用例3 hello() 返回非字符串: ' + JSON.stringify(r));
    }
  } catch (e) {
    bad('用例3 hello() 抛异常: ' + String(e));
  }

  // 用例4: add(40, 2) = 42
  try {
    const s = mod.add(40, 2);
    if (s === 42) {
      ok('用例4 add(40, 2) = ' + String(s) + ' (应为 42)');
    } else {
      bad('用例4 add(40, 2) = ' + String(s) + ' (应为 42)');
    }
  } catch (e) {
    bad('用例4 add() 抛异常: ' + String(e));
  }

  // 用例5: echo 往返 (数字 / 字符串)
  try {
    const n = mod.echo(123);
    const s = mod.echo('abc');
    if (n === 123 && s === 'abc') {
      ok('用例5 echo(123)=' + String(n) + ' echo("abc")=' + String(s));
    } else {
      bad('用例5 echo 往返不一致: echo(123)=' + String(n) + ' echo("abc")=' + String(s));
    }
  } catch (e) {
    bad('用例5 echo() 抛异常: ' + String(e));
  }

  // 用例6: 加载不存在的模块 → 抛异常 (验证 lookup 确实走 native 模块表)
  try {
    loader.load('lynxtron_definitely_not_exist');
    bad('用例6 load(不存在) 未抛异常');
  } catch (e) {
    ok('用例6 load(不存在) 抛异常: ' + String(e));
  }

  summarize();
}
