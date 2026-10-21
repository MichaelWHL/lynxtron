// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useState } from '@lynx-js/react';

declare const SystemInfo: { pixelRatio: number };

// On a density change the logical box stays 200x80, its physical size changes,
// and the root's logical size changes inversely without resizing the surface.
export default function App() {
  const [ticks, setTicks] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [box, setBox] = useState('pending');
  const [viewport, setViewport] = useState('pending');
  const [input, setInput] = useState('');
  const [scroll, setScroll] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTicks((value) => value + 1);
      lynx
        .createSelectorQuery()
        .select('#dpi-probe-box')
        .invoke({
          method: 'boundingClientRect',
          success: (data: any) => setBox(`${data.width}x${data.height}`),
          fail: () => setBox('query failed'),
        })
        .exec();
      lynx
        .createSelectorQuery()
        .select('#dpi-probe-root')
        .invoke({
          method: 'boundingClientRect',
          success: (data: any) => setViewport(`${data.width}x${data.height}`),
          fail: () => setViewport('query failed'),
        })
        .exec();
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <view
      id="dpi-probe-root"
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        padding: '16px',
        flexDirection: 'column',
      }}
    >
      <text style={{ fontSize: '20px', color: '#111111' }}>
        DPR={SystemInfo.pixelRatio} ticks={ticks} clicks={clicks}
      </text>
      <text style={{ fontSize: '18px', color: '#111111' }}>
        Viewport={viewport} box={box}
      </text>
      <view
        id="dpi-probe-box"
        bindtap={() => setClicks((value) => value + 1)}
        style={{
          width: '200px',
          height: '80px',
          marginTop: '16px',
          backgroundColor: '#12a86b',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <text style={{ fontSize: '18px', color: '#ffffff' }}>
          200x80: tap +1
        </text>
      </view>
      <input
        placeholder="DPI input test"
        bindinput={(event: any) => setInput(event.detail.value)}
        style={{
          width: '240px',
          height: '48px',
          marginTop: '16px',
          fontSize: '20px',
          backgroundColor: '#eeeeee',
        }}
      />
      <text style={{ fontSize: '18px', color: '#111111' }}>
        Input={input} scroll={scroll}
      </text>
      <scroll-view
        scroll-y
        bindscroll={(event: any) =>
          setScroll(Math.round(event.detail.scrollTop))
        }
        style={{
          width: '240px',
          height: '100px',
          marginTop: '16px',
          backgroundColor: '#dce8ff',
        }}
      >
        {Array.from({ length: 10 }, (_, index) => (
          <view key={index} style={{ height: '50px' }}>
            <text style={{ fontSize: '18px', color: '#111111' }}>
              Scroll row {index}
            </text>
          </view>
        ))}
      </scroll-view>
    </view>
  );
}
