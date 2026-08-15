// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { root, useEffect, useState } from '@lynx-js/react';
import './index.css';
import LogPanel from './LogPanel';
import { log, logError, logInfo, logWarn } from './log';
import { testSelectorQuery } from './selectorQueryTest';

// testDemo.ts 中每个测试方法对应一个按钮
const TEST_FUNCTIONS: Array<{ name: string; label: string; desc: string }> = [
  {
    name: 'testOpenExternal',
    label: 'OpenExternal',
    desc: 'shell.openExternal 多协议测试',
  },
  {
    name: 'testOpenPath',
    label: 'OpenPath',
    desc: 'shell.openPath 打开鸿蒙路径',
  },
  {
    name: 'testShowOpenDialog',
    label: 'ShowOpenDialog',
    desc: '打开文件对话框(交互)',
  },
  {
    name: 'testShowSaveDialog',
    label: 'ShowSaveDialog',
    desc: '保存对话框(交互)',
  },
  {
    name: 'testCreateFromPath',
    label: 'CreateFromPath',
    desc: 'nativeImage 从路径创建',
  },
  {
    name: 'testCreateFromBitmap',
    label: 'CreateFromBitmap',
    desc: 'nativeImage 位图创建/转换',
  },
  {
    name: 'testOnlock',
    label: 'PowerMonitor',
    desc: 'powerMonitor 锁屏事件监听',
  },
  // ── poll() 替代 select() 回归测试 (node_bindings_harmony.cc PollEvents) ──
  // {
  //   name: 'testPollHttpBasic',
  //   label: 'Poll.Basic',
  //   desc: '单次 HTTPS 请求耗时(回归阈值<3s)',
  // },
  // {
  //   name: 'testPollHttpConcurrent',
  //   label: 'Poll.Concurrent',
  //   desc: '10 并发请求不饿死',
  // },
  // {
  //   name: 'testPollTimerPrecision',
  //   label: 'Poll.Timer',
  //   desc: 'setTimeout 精度(timeout 路径)',
  // },
  // {
  //   name: 'testPollTimerAndIO',
  //   label: 'Poll.Mix',
  //   desc: '定时器+IO 混合唤醒',
  // },
  // {
  //   name: 'testPollConnectRefused',
  //   label: 'Poll.Refused',
  //   desc: '连接拒绝快速失败(POLLERR/HUP)',
  // },
  // {
  //   name: 'testPollRequestTimeout',
  //   label: 'Poll.Timeout',
  //   desc: '不可达地址超时兜底',
  // },
  // {
  //   name: 'testPollHttpLoop',
  //   label: 'Poll.Loop',
  //   desc: '20 次串行请求稳定性',
  // },
  // {
  //   name: 'testPollNoTimerIO',
  //   label: 'Poll.NoTimer',
  //   desc: '无 timer 时 IO 立即唤醒',
  // },
];

export default function WebContainer() {
  // 接收主进程通过 sendGlobalEvent 推送的 console 日志并渲染到页面
  useEffect(() => {
    const emitter = lynx.getJSModule('GlobalEventEmitter') as any;
    const handler = (payload: any) => {
      if (!payload || typeof payload.text !== 'string') return;
      const line = payload.from === 'main' ? `[main] ${payload.text}` : payload.text;
      if (payload.level === 'warn') logWarn(line);
      else if (payload.level === 'error') logError(line);
      else log(line);
    };
    emitter.addListener('bridge-log', handler, lynx);
    log('[App] 已连接主进程日志通道');
    return () => {
      if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('bridge-log', handler, lynx);
      } else if (typeof emitter.off === 'function') {
        emitter.off('bridge-log', handler, lynx);
      }
    };
  }, []);

  // 桥接主线程: 调用 Node 主进程中的 testDemo 测试方法
  const runTest = (name: string) => {
    logInfo(`▶ 调用主进程方法: ${name}`);
    NativeModules.bridge.call(
      name,
      {},
      (res: any) => {
        if (res && res.ok) {
          log(`✓ ${name} 执行完成`);
          if (res.data !== undefined && res.data !== null) {
            log(`  结果: ${JSON.stringify(res.data)}`);
          }
        } else {
          logError(`✗ ${name} 执行失败: ${res && res.error ? res.error : JSON.stringify(res)}`);
        }
      }
    );
  };
  function test() {

    logInfo('ZZFF', '开始');
    if (typeof lynx === 'undefined' || !lynx.requireModule) {
      logInfo('ZZFF', 'lynx.requireModule 不可用');
      return;
    }
    try {
      const mod: any = lynx.requireModule('https://registry.npmmirror.com/jquery/3.6.4/files/package.json')
      logInfo('ZZFF', '成功加载, md5 = ' + mod.md5);
      if (mod.md5) {
        logInfo('ZZFF', mod.md5);
      } else {
        logInfo('ZZFF', 'md5 为空');
      }
    } catch (e) {
      logInfo('ZZFF', '报错: ' + String(e));
    }
  }
  // Console 面板显隐
  const [showLog, setShowLog] = useState(true);

  return (
    <view clip-radius="true" className="outlineFrame">
      <view className="pageHeader">
        <view className="pageHeaderLeft">
          <text className="pageTitle">
            Lynx<text className="pageTitleAccent">tron</text>
          </text>
          <text className="pageSubtitle">UI ↔ Node 主进程 bridge 测试面板</text>
        </view>
        <view
          className={`logToggle ${showLog ? 'logToggle-on' : ''}`}
          bindtap={() => setShowLog((v) => !v)}
        >
          <view className={`logToggleDot ${showLog ? 'logToggleDot-on' : ''}`} />
          <text className="logToggleText">Console</text>
        </view>
      </view>

      <view className={`testArea ${showLog ? '' : 'testAreaFill'}`}>
        <view className="testSectionHeader">
          <view className="testSectionBar" />
          <text className="testSectionTitle">API 测试</text>
        </view>
        <view
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            padding: '12px 16px',
          }}
        >
          <view
            id="lxp-target"
            style={{
              width: '160px',
              height: '64px',
              backgroundColor: '#4f8cff',
              borderRadius: '8px',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <text style={{ color: '#fff', fontSize: '12px' }}>#lxp-target</text>
          </view>
          <view className="lxp-item" style={{ width: '80px', height: '40px', backgroundColor: '#3fb96b', borderRadius: '6px', marginLeft: '8px' }} />
          <view className="lxp-item" style={{ width: '80px', height: '40px', backgroundColor: '#3fb96b', borderRadius: '6px', marginLeft: '8px' }} />
          <view className="lxp-item" style={{ width: '80px', height: '40px', backgroundColor: '#3fb96b', borderRadius: '6px', marginLeft: '8px' }} />
          <text style={{ fontSize: '11px', color: '#8a8f98', marginLeft: '10px' }}>测试目标: #lxp-target + 3× .lxp-item</text>
        </view>
        <view className={`testGrid ${showLog ? '' : 'testGridFill'}`}>
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
            <view className="testButton" bindtap={() => { test() }}>
              <view className="testButtonDot" />
              <text className="testButtonText">requireModule</text>
              <text className="testButtonArrow">›</text>
            </view>
          </view>
             <view className="testCard">
            <view className="testButton" bindtap={() => { testSelectorQuery(); }}>
              <view className="testButtonDot" />
              <text className="testButtonText">SelectorQuery</text>
              <text className="testButtonArrow">›</text>
            </view>
            <text className="testCardDesc">createSelectorQuery 五个用例</text>
          </view>
        </view>
      </view>

      {showLog ? <LogPanel /> : null}
    </view>
  );
}

root.render(<WebContainer />);
