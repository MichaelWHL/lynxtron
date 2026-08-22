// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { useNavigate } from 'react-router';
import { logInfo } from '../../utils/log';

/** ZF 子路由首页(index): 总览并跳转到具体用例 */
export default function ZfOverview() {
  const navigate = useNavigate();

  useEffect(() => {
    logInfo('[ZF] 总览页已加载');
  }, []);

  const items = [
    { path: '/zf/js', label: 'JSModule', desc: 'getJSModule/registerModule 四个用例' },
    { path: '/zf/selector', label: 'SelectorQuery', desc: 'createSelectorQuery 六个用例' },
    { path: '/zf/module', label: 'ModuleLoader', desc: 'getModuleLoader().load() 原生模块六个用例' },
    { path: '/zf/font', label: 'AddFont', desc: 'addFont(data URI) 字体加载 + 轮询宽度测量' },
  ];

  return (
    <view className="pageStack">
      <text className="pageDesc">
        点击下方按钮或顶部 Tab 进入嵌套子路由, 每个页面加载时会向底部 Console 输出日志。
      </text>
      <view className="testGrid">
        {items.map((it) => (
          <view className="testCard" key={it.path}>
            <view className="testButton" bindtap={() => navigate(it.path)}>
              <view className="testButtonDot" />
              <text className="testButtonText">{it.label}</text>
              <text className="testButtonArrow">›</text>
            </view>
            <text className="testCardDesc">{it.desc}</text>
          </view>
        ))}
      </view>
    </view>
  );
}
