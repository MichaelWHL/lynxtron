// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import React from 'react';

interface CardProps {
  title: string;
  description: string;
  icon: string;
}

const Card: React.FC<CardProps> = ({ title, description, icon }) => {
  return (
    <view className="card">
      <view className="cardIcon">
        <image src={icon} mode="aspectFit" className="cardIconImage" />
      </view>
      <text className="cardTitle">{title}</text>
      <text className="cardDesc">{description}</text>
    </view>
  );
};

export default Card;
