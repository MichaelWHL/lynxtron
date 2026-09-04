// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { MemoryRouter, Navigate, Route, Routes } from 'react-router';

import AppLayout from '../components/AppLayout';
import HomePage from '../pages/HomePage';
import TestModulePage from '../pages/zf/TestModulePage';
import WindowPage from '../pages/sph/WindowPage';
import NotFoundPage from '../pages/NotFoundPage';
import AppModulePage from '../pages/zll/AppModulePage';
import YbModulePage from '../pages/yb/AppModulePage';

/**
 * react-router v6 (MemoryRouter) 嵌套路由表:
 *   /             AppLayout(左菜单 + 右侧 Outlet + 底部常驻日志)
 *   ├- index      首页
 *   ├- zll        App Module API
 *   ├- zf         → 重定向到 /zf/shell(一级导航即模块)
 *   ├- zf/:moduleId   ZF 模块页(shell/dialog/.../lynx, 由左侧菜单驱动)
 *   ├- sph        Window 测试
 *   ├- yb         yb API
 *   └- *          404
 */
export default function AppRouter() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="zll" element={<AppModulePage />} />
          <Route path="zf" element={<Navigate to="/zf/shell" replace />} />
          <Route path="zf/:moduleId" element={<TestModulePage />} />
          <Route path="sph" element={<WindowPage />} />
          <Route path="yb" element={<YbModulePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
