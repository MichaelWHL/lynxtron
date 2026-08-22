// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { useNavigate } from 'react-router';
import { logInfo } from '../utils/log';

/** 首页: 进入时打日志, 展示整体导航 */
export default function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    logInfo('[Home] 首页已加载');
  }, []);

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">首页 · 测试面板</text>
      </view>
      <text className="pageDesc">
        根据功能划分<text className="mono">lynxtron 醒图 api</text> 模块，harmony适配部分测试：
      </text>

      <view className="homeCardGrid">
        <view className="homeCard" bindtap={() => navigate('/zll')}>
          <view className="homeCardDot" />
          <text className="homeCardTitle">App Module API</text>
          <text className="homeCardDesc">调用 app模块 主进程测试方法</text>
        </view>
        <view className="homeCard" bindtap={() => navigate('/zf/shell')}>
          <view className="homeCardDot" />
          <text className="homeCardTitle">ZF 测试</text>
          <text className="homeCardDesc">按模块导航: shell/dialog/nativeImage/lynx 等</text>
        </view>
        <view className="homeCard" bindtap={() => navigate('/sph')}>
          <view className="homeCardDot" />
          <text className="homeCardTitle">Window 测试</text>
          <text className="homeCardDesc">窗口管理用例占位页</text>
        </view>
      </view>
    </view>
  );
}
