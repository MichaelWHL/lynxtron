// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { logInfo } from '../../utils/log';

/** Window 管理测试占位页(对应 testModules/sph) */
export default function WindowPage() {
  useEffect(() => {
    logInfo('[SPH] Window 测试页面已加载');
  }, []);

  const handleRunTests = () => {
    logInfo('[SPH] 触发 WindowManager 测试');
    NativeModules.bridge.call(
      'runWindowManagerTests',
      {},
      (res: any) => {
        if (res && res.ok) {
          logInfo('[SPH] 测试已启动:', res.data);
        } else {
          logInfo('[SPH] 测试触发失败:', res);
        }
      }
    );
  };

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">Window 测试</text>
      </view>
      <text className="pageDesc">
        窗口管理用例(testModules/sph)当前以主进程脚本形式运行, 结果通过 bridge 推送到底部 Console。
      </text>
      <view className="testCard">
        <view className="testButton" bindtap={handleRunTests}>
          <view className="testButtonDot" />
          <text className="testButtonText">运行 Window 测试</text>
          <text className="testButtonArrow">›</text>
        </view>
        <text className="testCardDesc">点击左侧菜单切换路由验证页面切换</text>
      </view>
    </view>
  );
}
