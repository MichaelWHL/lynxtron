// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { useNavigate } from 'react-router';
import { logError } from '../utils/log';

/** 404 兜底页 */
export default function NotFoundPage() {
  const navigate = useNavigate();

  useEffect(() => {
    logError('[404] 未匹配到路由');
  }, []);

  return (
    <view className="pageStack">
      <view className="pageSectionHeader">
        <view className="pageSectionBar" />
        <text className="pageSectionTitle">404 · 页面不存在</text>
      </view>
      <view className="testCard">
        <view className="testButton" bindtap={() => navigate('/')}>
          <view className="testButtonDot" />
          <text className="testButtonText">返回首页</text>
          <text className="testButtonArrow">›</text>
        </view>
        <text className="testCardDesc">路径未匹配任何嵌套路由</text>
      </view>
    </view>
  );
}
