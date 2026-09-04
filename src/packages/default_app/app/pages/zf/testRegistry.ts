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
//
// 【统计相关(新增)】
//  - manual: 交互式/依赖真机交互的用例标 true, 进入路由自动执行时会跳过,
//    但仍可手动触发, 且其结果经 [PASS]/[FAIL] 日志计入统计。
//  - 统计口径: 数日志中 [PASS]/[FAIL] 标记, 自动 + 手动统一纳入。
// =============================================================================

import { log, logInfo, logPass, logFail } from '../../utils/log';
import { testAddFont, fontInput } from '../../testModules/zf/fontTest';
import { testJSModule } from '../../testModules/zf/jsModuleTest';
import { testModuleLoader } from '../../testModules/zf/moduleLoaderTest';
import { testSelectorQuery } from '../../testModules/zf/selectorQueryTest';

/** 单个测试项: 页面渲染为一个按钮 */
export interface TestItem {
  id: string;
  label: string; // 按钮文字
  desc: string; // 按钮说明
  /** 交互式/依赖真机交互: 自动执行跳过, 仍可手动触发(结果计入统计) */
  manual?: boolean;
  /** 手动操作说明(manual 用例必填): 分步骤提示, 页面上逐行展示 */
  manualGuide?: string[];
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

/** 封装主进程测试: 通过 NativeModules.bridge 调用 testDemo.ts 中的方法。
 *  通过/失败由主进程 testDemo 自身的 [PASS]/[FAIL] 日志回传并统计,
 *  此处不再叠加 logPass/logFail, 避免重复计数。 */
function bridgeTest(name: string, label: string, desc: string, manual = false, manualGuide?: string[]): TestItem {
  return {
    id: name,
    label,
    desc,
    manual,
    manualGuide,
    run: () => {
      logInfo(`▶ 调用主进程方法: ${name}`);
      NativeModules.bridge.call(name, {}, (res: any) => {
        if (res && res.ok) {
          log(`  ${name} 调用返回 ok, 结果见主进程日志`);
          if (res.data !== undefined && res.data !== null) {
            log(`  结果: ${JSON.stringify(res.data)}`);
          }
        } else {
          logFail(name, '调用失败: ' + (res && res.error ? res.error : JSON.stringify(res)));
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
    desc: 'addFont 字体加载 + 轮询宽度测量(可自填 FONT_SRC), 成功后下方 #ft-custom 生效',
    manual: true, // 依赖渲染就绪回调 + 用户输入字体源
    manualGuide: [
      '在下方输入框填入 FONT_SRC 后点"运行"(字体名固定为 sq-font):',
      '① FONT_SRC: 填入字体 URL 或 data URI, 如 url(中间填 http://.../xx.ttf 带引号)',
      '② 点"运行"自动加载并轮询测量宽度, 无需其它操作',
      '若下方 #ft-custom 文字从灰变亮即字体生效, 结果自动计入统计',
    ],
    run: (onReady) => testAddFont(fontInput, onReady),
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
      bridgeTest(
        'testShowOpenDialog', 'ShowOpenDialog', '打开文件对话框(交互)', true,
        [
          '点击按钮后真机将连续弹出 6 次文件选择器, 每次操作完自动进入下一次:',
          '① 单选文件(默认) → 选择任意一个文件后点"确定"',
          '② 多选文件 → 长按/勾选多个文件后点"确定"',
          '③ 选择目录 → 进入任意一个目录后点"确定"',
          '④ 带 filters(*.js/*.ts) → 选一个 .js 或 .ts 文件后点"确定"',
          '⑤ 带 defaultPath → 在默认路径下选任意一个文件点"确定"',
          '⑥ 用户取消 → 直接点"取消"(验证取消分支)',
          '全部 6 次操作完成后, 结果自动打印并计入统计',
        ]
      ),
      bridgeTest(
        'testShowSaveDialog', 'ShowSaveDialog', '保存对话框(交互)', true,
        [
          '点击按钮后真机将连续弹出 4 次保存对话框, 每次操作完自动进入下一次:',
          '① 默认保存 → 直接点"保存"(或用默认文件名)',
          '② 带 defaultPath → 在默认路径下点"保存"',
          '③ 带 filters(*.txt/*.md) → 输入一个 .txt 或 .md 文件名后点"保存"',
          '④ 用户取消 → 直接点"取消"(验证取消分支)',
          '全部 4 次操作完成后, 结果自动打印并计入统计',
        ]
      ),
    ],
  },
  {
    id: 'nativeImage',
    label: 'nativeImage',
    desc: 'nativeImage 模块: 图片创建与格式转换',
    tests: [
      bridgeTest(
        'testCreateFromPath', 'CreateFromPath', 'nativeImage 从路径创建', true,
        [
          '点击按钮后真机弹出一次文件选择器:',
          '选择一张 png/jpg/jpeg/webp 图片 → 点"确定"',
          '选中后自动加载并打印 isEmpty / size; 若点了取消会判为失败',
        ]
      ),
      bridgeTest(
        'testCreateFromBitmap', 'CreateFromBitmap', 'nativeImage 位图创建/转换', true,
        [
          '点击按钮后真机弹出一次文件选择器:',
          '选择一张 png/jpg/jpeg 图片 → 点"确定"',
          '会先 createFromPath 加载, 再做 toBitmap 往返 + toPNG 编码, 结果自动打印',
        ]
      ),
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
        '事件监听: 注册 lock-screen/unlock-screen, 5s 后自动取消注册',
        true,
        [
          '点击按钮后注册 lock-screen / unlock-screen 监听(仅 5 秒):',
          '① 请在 5 秒内按电源键锁屏一次 → 观察日志出现 [powerMonitor] PASS: lock-screen',
          '② 再解锁一次 → 观察日志出现 [powerMonitor] PASS: unlock-screen',
          '5 秒后自动取消注册并打印最终结果; 若顺序错乱(如重复 lock)会判失败',
        ]
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

  // -----------------------------------------------------------------------------
  // poll 模块: io.poll 事件循环回归用例(8 项)。当前暂不展示, 恢复时取消注释即可。
  // 取消注释后导航自动出现该模块, 无需其他改动。
  // -----------------------------------------------------------------------------
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