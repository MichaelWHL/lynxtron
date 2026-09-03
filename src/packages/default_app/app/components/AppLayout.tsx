// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { Outlet, useLocation, useNavigate } from 'react-router';

import LogPanel from './LogPanel';
import { log, logInfo, logError, logWarn } from '../utils/log';
import { TEST_MODULES } from '../pages/zf/testRegistry';

export interface MenuItem {
  path: string;
  label: string;
  group: string;
}

/**
 * 左侧菜单: 每个菜单项对应一条路由; group 用于分区标题。
 * part3 由 testRegistry 的 TEST_MODULES 动态生成(一级导航即模块),
 * 注册表中注释/置空的模块自动不出现在菜单中。
 */
export const MENU_ITEMS: MenuItem[] = [
  { path: '/', label: 'App', group: '首页' },
  { path: '/zll', label: ' APP MODULE API', group: 'part1' },
  { path: '/yb', label: 'update and win.on API', group: 'part2' },
  ...TEST_MODULES.filter((m) => m.tests.length > 0).map((m) => ({
    path: `/zf/${m.id}`,
    label: m.label,
    group: 'part3',
  })),
  { path: '/sph', label: 'Window 测试', group: 'part4' },
];

/**
 * 应用主布局(嵌套路由的父级):
 *   ├- 页头
 *   ├- 左侧菜单 + 右侧内容区(<Outlet/> 渲染子路由)
 *   └- 底部 LogPanel 常驻(所有页面日志都在这里可见)
 */
export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // 接收主进程通过 sendGlobalEvent 推送的 console 日志并渲染到页面
  useEffect(() => {
    const emitter = lynx.getJSModule('GlobalEventEmitter') as any;
    const handler = (payload: any) => {
      if (!payload || typeof payload.text !== 'string') return;
      const line = payload.from === 'main' ? `[main] ${payload.text}` : payload.text;
      if (payload.level === 'warn') logWarn(line);
      else if (payload.level === 'info') logInfo(line);
      else if (payload.level === 'error') logError(line);
      else log(line);
    };
    emitter.addListener('bridge-log', handler, lynx);
    log('[Layout] 已连接主进程日志通道');
    // 通知主进程: bridge-log 监听已就绪, 可以补发初始化前的缓存日志
    NativeModules.bridge.call('logChannelReady', {}, () => {});
    return () => {
      if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('bridge-log', handler, lynx);
      } else if (typeof emitter.off === 'function') {
        emitter.off('bridge-log', handler, lynx);
      }
    };
  }, []);

  // 路由切换时记录日志, 方便在底部 Console 面板观察跳转
  useEffect(() => {
    log(`[Route] ${location.pathname}`);
  }, [location.pathname]);

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  // 按 group 分组渲染菜单, 保证分区顺序稳定
  const groups: string[] = [];
  for (const item of MENU_ITEMS) {
    if (!groups.includes(item.group)) groups.push(item.group);
  }

  return (
    <view className="container">
      <view className="pageHeader">
        <view className="pageHeaderLeft">
          <text className="pageTitle">
            Lynxtron<text className="pageTitleAccent"> api</text>
          </text>
          <text className="pageSubtitle">Lynxtron Api · 测试面板</text>
        </view>
      </view>

      <view className="appBody">
        {/* -- 左侧菜单区 -- */}
        <scroll-view scroll-orientation="vertical" className="sidebar">
          {groups.map((g) => (
            <view key={g} className="menuGroup">
              <text className="menuGroupTitle">{g}</text>
              {MENU_ITEMS.filter((m) => m.group === g).map((item) => {
                const active = isActive(item.path);
                return (
                  <view
                    key={item.path}
                    className={`menuItem ${active ? 'menuItem-active' : ''}`}
                    bindtap={() => navigate(item.path)}
                  >
                    <view className={`menuItemDot ${active ? 'menuItemDot-on' : ''}`} />
                    <text className="menuItemText">{item.label}</text>
                  </view>
                );
              })}
            </view>
          ))}
        </scroll-view>

        {/* -- 右侧内容区: 渲染当前路由对应的页面 -- */}
        <scroll-view scroll-orientation="vertical" className="contentArea">
          <view className="pageSection">
            <Outlet />
          </view>
        </scroll-view>
      </view>

      {/* -- 底部日志面板: 常驻, 任何页面产生的日志都在这里显示 -- */}
      <LogPanel />
    </view>
  );
}
