// Copyright 2026 The Lynxtron Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect } from '@lynx-js/react';
import { useNavigate } from 'react-router';

/** 404 兜底页 */
export default function YbModulePage() {
    const navigate = useNavigate();

    useEffect(() => {
    }, []);

    return (
        <view className="pageStack">
            <view className="pageSectionHeader">
                <view className="pageSectionBar" />
                <text className="pageSectionTitle">yb module</text>
            </view>
            <view className="testCard">

            </view>
        </view>
    );
}
