// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// =============================================================================
// ZF 测试区 · 模块/测试注册表（单一数据源）
// -----------------------------------------------------------------------------
// 页面 TestModulePage 只负责渲染本注册表, 新增测试无需改动页面与路由。
//
// 【如何扩展】
//  1. 新增模块: 在 TEST_MODULES 数组末尾追加
//       { id, label, desc, tests: [] }
//  2. 新增测试: 在对应模块的 tests 数组追加
//       { id, label, desc, run }
//  3. 主进程测试: run 用 bridgeTest('testXxx', label, desc) 封装
//     内部会通过 NativeModules.bridge.call 调用主进程 testDemo.ts 的方法。
//  4. 渲染层测试: run 直接引用 app/testModules/zf 下的测试函数。
//  5. 模块被注释 / tests 为空: 导航自动隐藏, 取消注释即恢复展示。
// =============================================================================

import { log, logInfo, logPass, logFail } from '../../utils/log';
import { testAddFont } from '../../testModules/zf/fontTest';
import { testJSModule } from '../../testModules/zf/jsModuleTest';
import { testModuleLoader } from '../../testModules/zf/moduleLoaderTest';
import { testSelectorQuery } from '../../testModules/zf/selectorQueryTest';

/** 单个测试项: 页面渲染为一个按钮 */
export interface TestItem {
  id: string;
  label: string; // 按钮文字
  desc: string; // 按钮说明
  /** 执行函数; onReady 仅供 addFont 等需要回调渲染节点的测试使用 */
  run: (onReady?: () => void) => void;
}

/** 测试模块: 页面左侧导航中的一项 */
export interface TestModule {
  id: string;
  label: string; // 左侧导航名
  desc: string; // 模块说明
  tests: TestItem[];
}

/** 封装主进程测试: 通过 NativeModules.bridge 调用 testDemo.ts 中的方法 */
function bridgeTest(name: string, label: string, desc: string): TestItem {
  return {
    id: name,
    label,
    desc,
    run: () => {
      logInfo(`▶ 调用主进程方法: ${name}`);
      NativeModules.bridge.call(name, {}, (res: any) => {
        if (res && res.ok) {
          logPass(name, '执行通过');
          if (res.data !== undefined && res.data !== null) {
            log(`  结果: ${JSON.stringify(res.data)}`);
          }
        } else {
          logFail(name, '执行失败: ' + (res && res.error ? res.error : JSON.stringify(res)));
        }
      });
    },
  };
}

/** lynx.requireModule: 远程 npm 模块加载 */
function runRequireModule(): void {
  const TAG = 'RM';
  logInfo(TAG, '测试开始');
  if (typeof lynx === 'undefined' || !lynx.requireModule) {
    logFail(TAG, 'lynx.requireModule 不可用');
    return;
  }
  try {
    const mod: any = lynx.requireModule(
      'https://registry.npmmirror.com/jquery/3.6.4/files/package.json'
    );
    if (mod && mod.name) {
      logPass(TAG, '加载成功, name = ' + mod.name);
    } else {
      logFail(TAG, '加载结果异常: ' + JSON.stringify(mod));
    }
  } catch (e) {
    logFail(TAG, '报错: ' + String(e));
  }
}

/** 渲染层 lynx 模块的全部测试项 */
const lynxTests: TestItem[] = [
  {
    id: 'jsModule',
    label: 'JSModule',
    desc: 'getJSModule/registerModule 四个用例',
    run: () => testJSModule(),
  },
  {
    id: 'moduleLoader',
    label: 'ModuleLoader',
    desc: 'getModuleLoader().load() 加载 lynxtron_hello 六个用例',
    run: () => testModuleLoader(),
  },
  {
    id: 'selectorQuery',
    label: 'SelectorQuery',
    desc: 'createSelectorQuery 六个用例, 目标为下方 #lxp-target 与 .lxp-item',
    run: () => testSelectorQuery(),
  },
  {
    id: 'addFont',
    label: 'AddFont',
    desc: 'addFont(data URI) 字体加载 + 轮询宽度测量, 成功后下方 #ft-custom 生效',
    run: (onReady) => testAddFont(onReady),
  },
  {
    id: 'requireModule',
    label: 'requireModule',
    desc: 'lynx.requireModule 远程 npm 模块加载',
    run: () => runRequireModule(),
  },
];

/** 模块数组: 顺序即左侧导航顺序, shell 为首默认选中 */
export const TEST_MODULES: TestModule[] = [
  {
    id: 'shell',
    label: 'shell',
    desc: 'shell 主进程模块: 打开外部链接 / 系统路径',
    tests: [
      bridgeTest('testOpenExternal', 'OpenExternal', 'shell.openExternal 多协议测试'),
      bridgeTest('testOpenPath', 'OpenPath', 'shell.openPath 打开鸿蒙路径'),
    ],
  },
  {
    id: 'dialog',
    label: 'dialog',
    desc: '对话框模块: 打开 / 保存文件对话框(交互)',
    tests: [
      bridgeTest('testShowOpenDialog', 'ShowOpenDialog', '打开文件对话框(交互)'),
      bridgeTest('testShowSaveDialog', 'ShowSaveDialog', '保存对话框(交互)'),
    ],
  },
  {
    id: 'nativeImage',
    label: 'nativeImage',
    desc: 'nativeImage 模块: 图片创建与格式转换',
    tests: [
      bridgeTest('testCreateFromPath', 'CreateFromPath', 'nativeImage 从路径创建'),
      bridgeTest('testCreateFromBitmap', 'CreateFromBitmap', 'nativeImage 位图创建/转换'),
    ],
  },
  {
    id: 'powerMonitor',
    label: 'powerMonitor',
    desc: 'powerMonitor 模块: 系统锁屏 / 解锁事件监听',
    tests: [
      bridgeTest(
        'testOnlock',
        'PowerMonitor',
        '事件监听: 注册 lock-screen/unlock-screen, 5s 后自动取消注册'
      ),
    ],
  },
  {
    id: 'screen',
    label: 'screen',
    desc: 'screen 模块: 屏幕信息查询',
    tests: [
      bridgeTest('testGetPrimaryDisplay', 'GetPrimaryDisplay', '获取主屏幕信息'),
    ],
  },
  {
    id: 'clipboard',
    label: 'clipboard',
    desc: 'clipboard 模块: 系统剪贴板读写',
    tests: [
      bridgeTest('testClipboardWriteText', 'ClipboardWriteText', 'Clipboard 写入文本'),
    ],
  },
  {
    id: 'lynx',
    label: 'lynx',
    desc: '渲染层 API: JSModule / SelectorQuery / ModuleLoader / AddFont / requireModule',
    tests: lynxTests,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // poll 模块: io.poll 事件循环回归用例(8 项)。当前暂不展示, 恢复时取消注释即可。
  // 取消注释后导航自动出现该模块, 无需其他改动。
  // ─────────────────────────────────────────────────────────────────────────────
  // {
  //   id: 'poll',
  //   label: 'poll',
  //   desc: 'io.poll 事件循环回归用例(8 项)',
  //   tests: [
  //     bridgeTest('testPollHttpBasic', 'PollHttpBasic', 'HTTP 基础轮询用例'),
  //     bridgeTest('testPollHttpConcurrent', 'PollHttpConcurrent', 'HTTP 并发轮询用例'),
  //     bridgeTest('testPollTimerPrecision', 'PollTimerPrecision', 'Timer 精度轮询用例'),
  //     bridgeTest('testPollTimerAndIO', 'PollTimerAndIO', 'Timer 与 IO 混合轮询用例'),
  //     bridgeTest('testPollConnectRefused', 'PollConnectRefused', '连接拒绝(ECONNREFUSED)用例'),
  //     bridgeTest('testPollRequestTimeout', 'PollRequestTimeout', '请求超时用例'),
  //     bridgeTest('testPollHttpLoop', 'PollHttpLoop', 'HTTP 循环轮询用例'),
  //     bridgeTest('testPollNoTimerIO', 'PollNoTimerIO', '无 Timer 纯 IO 轮询用例'),
  //   ],
  // },
];
