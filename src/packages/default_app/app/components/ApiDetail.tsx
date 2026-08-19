import React, { useEffect } from 'react';

interface ApiDetailProps {
  apiName: string;
  onBack: () => void;
}

const apiDescriptions: Record<string, string> = {
  Clipboard: 'Read and write clipboard content',
  Dialog: 'Show native dialog windows',
  FileSystem: 'Read, write, and watch files',
  Storage: 'Persist key-value data locally',
  Network: 'Make HTTP and WebSocket requests',
  Notification: 'Send desktop notifications',
  Screen: 'Get screen size and display info',
  Shell: 'Open files, folders, and URLs in desktop',
};

const ApiDetail: React.FC<ApiDetailProps> = ({ apiName, onBack }) => {
  useEffect(() => {
    try {
      NativeModules.bridge.call('setTitle', {
        title: 'LYNXTRON_' + apiName,
      });
    } catch (_e) {
      // setTitle may not be available in all environments
    }
  }, [apiName]);

  const description = apiDescriptions[apiName] ?? '';

  return (
    <view className="container">
      <view className="header">
        <view className="backButton" bindtap={onBack}>
          <text className="backButtonText">Back</text>
        </view>
        <text className="logo">{apiName} API</text>
        <view className="statusBadge">
          <view className="statusDot" />
          <text className="statusText">Running</text>
        </view>
      </view>

      <view className="apiDetailHero">
        <view className="apiDetailIconLarge">
          <text className="apiDetailIconLargeText">{apiName.charAt(0)}</text>
        </view>
        <text className="apiDetailTitle">{apiName} API</text>
        <text className="apiDetailDesc">{description}</text>
        <view className="divider" />
      </view>

      <view className="apiDetailContent">
        <text className="apiDetailSectionTitle">Demo</text>
        <view className="apiDetailDemoBox">
          <text className="apiDetailDemoText">
            This is a demo page for the {apiName} API.
          </text>
          <text className="apiDetailDemoHint">
            Implement your {apiName} API demo logic here.
          </text>
        </view>
      </view>
    </view>
  );
};

export default ApiDetail;
