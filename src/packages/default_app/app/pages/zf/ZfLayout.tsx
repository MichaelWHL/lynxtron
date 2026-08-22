// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { logInfo } from '../../utils/log';

const SUB_TABS = [
  { path: '/zf', label: '总览' },
  { path: '/zf/js', label: 'JSModule' },
  { path: '/zf/selector', label: 'SelectorQuery' },
  { path: '/zf/module', label: 'ModuleLoader' },
  { path: '/zf/font', label: 'AddFont' },
];

/**
 * ZF 测试父级路由布局: 二级 Tab + <Outlet/>
 * 演示 react-router 嵌套路由: 子路由在 Outlet 中切换, 布局不销毁。
 */
export default function ZfLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    logInfo('[ZF] ZF 测试布局已加载(嵌套路由父级)');
  }, []);

  const isActive = (path: string) =>
    path === '/zf' ? location.pathname === '/zf' : location.pathname.startsWith(path);

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">part3 zf module</text>
      </view>

      <view className="zfTabs">
        {SUB_TABS.map((t) => {
          const active = isActive(t.path);
          return (
            <view
              key={t.path}
              className={`zfTab ${active ? 'zfTab-active' : ''}`}
              bindtap={() => navigate(t.path)}
            >
              <text className="zfTabText">{t.label}</text>
            </view>
          );
        })}
      </view>

      <view className="zfContent">
        <Outlet />
      </view>
    </view>
  );
}
