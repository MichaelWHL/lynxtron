// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { MemoryRouter, Route, Routes } from 'react-router';

import AppLayout from '../components/AppLayout';
import HomePage from '../pages/HomePage';
import BridgePage from '../pages/BridgePage';
import ZfLayout from '../pages/zf/ZfLayout';
import ZfOverview from '../pages/zf/ZfOverview';
import JsModulePage from '../pages/zf/JsModulePage';
import SelectorQueryPage from '../pages/zf/SelectorQueryPage';
import ModuleLoaderPage from '../pages/zf/ModuleLoaderPage';
import FontPage from '../pages/zf/FontPage';
import WindowPage from '../pages/sph/WindowPage';
import NotFoundPage from '../pages/NotFoundPage';
import AppModulePage from '../pages/zll/AppModulePage';
import YbModulePage from '../pages/yb/AppModulePage';

/**
 * react-router v6 (MemoryRouter) 嵌套路由表:
 *   /             AppLayout(左菜单 + 右侧 Outlet + 底部常驻日志)
 *   ├─ index      首页
 *   ├─ bridge     Bridge API 测试
 *   ├─ zf         ZF 测试布局(嵌套子路由)
 *   │  ├─ index      总览
 *   │  ├─ js         getJSModule
 *   │  ├─ selector   createSelectorQuery
 *   │  ├─ module     getModuleLoader
 *   │  └─ font       addFont
 *   ├─ sph        Window 测试
 *   └─ *          404
 */
export default function AppRouter() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="zll" element={<AppModulePage />} />
          <Route path="zf" element={<ZfLayout />}>
            <Route index element={<ZfOverview />} />
            <Route path="js" element={<BridgePage />} />
          </Route>
          <Route path="sph" element={<WindowPage />} />
          <Route path="yb" element={<YbModulePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
