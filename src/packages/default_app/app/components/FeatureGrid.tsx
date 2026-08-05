// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import React from 'react';
import Card from './Card';
import lightning from '../assets/lightning.png';
import box from '../assets/box.png';
import panel from '../assets/panel.png';

const FeatureGrid: React.FC = () => {
  const features = [
    {
      title: 'Lightweight',
      description: 'Powered by Lynx rendering engine with minimal resource usage and fast startup.',
      icon: lightning,
    },
    {
      title: 'Extensible',
      description: 'Custom native modules via UI extension C-APIs and Node-API.',
      icon: box,
    },
    {
      title: 'Multiplatform',
      description: 'Runs on HarmonyOS and beyond with minimal platform-specific code.',
      icon: panel,
    },
    {
      title: 'Native Performance',
      description: 'Directly draws with Skia for smooth 60fps rendering.',
      icon: lightning,
    },
  ];

  return (
    <view className="cardGrid">
      {features.map((feature, index) => (
        <Card key={index} {...feature} />
      ))}
    </view>
  );
};

export default FeatureGrid;
