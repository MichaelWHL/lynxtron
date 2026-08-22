// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { log, logError, logInfo } from '../utils/log';

// testDemo.ts 中每个测试方法对应一个按钮
const TEST_FUNCTIONS: Array<{ name: string; label: string; desc: string }> = [
  { name: 'testOpenExternal', label: 'OpenExternal', desc: 'shell.openExternal 多协议测试' },
  { name: 'testOpenPath', label: 'OpenPath', desc: 'shell.openPath 打开鸿蒙路径' },
  { name: 'testShowOpenDialog', label: 'ShowOpenDialog', desc: '打开文件对话框(交互)' },
  { name: 'testShowSaveDialog', label: 'ShowSaveDialog', desc: '保存对话框(交互)' },
  { name: 'testCreateFromPath', label: 'CreateFromPath', desc: 'nativeImage 从路径创建' },
  { name: 'testCreateFromBitmap', label: 'CreateFromBitmap', desc: 'nativeImage 位图创建/转换' },
  { name: 'testOnlock', label: 'PowerMonitor', desc: 'powerMonitor 锁屏事件监听' },
  { name: 'testGetPrimaryDisplay', label: 'testGetPrimaryDisplay', desc: '获取主屏幕信息' },
  { name: 'testClipboardWriteText', label: 'ClipboardWriteText', desc: 'Clipboard 写入文本' },
];

/** Bridge API 页: 通过 NativeModules.bridge 调用主进程测试方法 */
export default function BridgePage() {
  useEffect(() => {
    logInfo('[Bridge] Bridge API 页面已加载');
  }, []);

  // 桥接主线程: 调用 Node 主进程中的 testDemo 测试方法
  const runTest = (name: string) => {
    logInfo(`▶ 调用主进程方法: ${name}`);
    NativeModules.bridge.call(name, {}, (res: any) => {
      if (res && res.ok) {
        log(`✓ ${name} 执行完成`);
        if (res.data !== undefined && res.data !== null) {
          log(`  结果: ${JSON.stringify(res.data)}`);
        }
      } else {
        logError(`✗ ${name} 执行失败: ${res && res.error ? res.error : JSON.stringify(res)}`);
      }
    });
  };

  const testRequireModule = () => {
    logInfo('ZZFF', '开始');
    if (typeof lynx === 'undefined' || !lynx.requireModule) {
      logInfo('ZZFF', 'lynx.requireModule 不可用');
      return;
    }
    try {
      const mod: any = lynx.requireModule(
        'https://registry.npmmirror.com/jquery/3.6.4/files/package.json'
      );
      logInfo('ZZFF', '成功加载, name = ' + mod.name);
      if (mod.name) logInfo('ZZFF', mod.name);
      else logInfo('ZZFF', 'name 为空');
    } catch (e) {
      logInfo('ZZFF', '报错: ' + String(e));
    }
  };

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">Bridge API 测试</text>
      </view>

      <view className="testGrid">
        {TEST_FUNCTIONS.map((t) => (
          <view className="testCard" key={t.name}>
            <view className="testButton" bindtap={() => runTest(t.name)}>
              <view className="testButtonDot" />
              <text className="testButtonText">{t.label}</text>
              <text className="testButtonArrow">›</text>
            </view>
            <text className="testCardDesc">{t.desc}</text>
          </view>
        ))}
        <view className="testCard">
          <view className="testButton" bindtap={testRequireModule}>
            <view className="testButtonDot" />
            <text className="testButtonText">requireModule</text>
            <text className="testButtonArrow">›</text>
          </view>
          <text className="testCardDesc">远程 npm 模块加载</text>
        </view>
      </view>
    </view>
  );
}
