import React from 'react';

export interface ApiItem {
  name: string;
  description: string;
}

interface ApiListProps {
  onBack: () => void;
  onNavigate: (path: string) => void;
}

const apiList: ApiItem[] = [
  { name: 'Clipboard', description: 'Read and write clipboard content' },
  { name: 'Dialog', description: 'Show native dialog windows' },
  { name: 'FileSystem', description: 'Read, write, and watch files' },
  { name: 'Storage', description: 'Persist key-value data locally' },
  { name: 'Network', description: 'Make HTTP and WebSocket requests' },
  { name: 'Notification', description: 'Send desktop notifications' },
  { name: 'Screen', description: 'Get screen size and display info' },
  { name: 'Shell', description: 'Open files, folders, and URLs in desktop' },
];

const ApiList: React.FC<ApiListProps> = ({ onBack, onNavigate }) => {
  return (
    <view className="container">
      <view className="header">
        <view className="backButton" bindtap={onBack}>
          <text className="backButtonText">Back</text>
        </view>
        <text className="logo">API Demos</text>
        <view className="statusBadge">
          <view className="statusDot" />
          <text className="statusText">Running</text>
        </view>
      </view>

      <view className="apiListHero">
        <text className="apiListTitle">API Directory</text>
        <text className="apiListSubtitle">
          Select an API to view its demo
        </text>
      </view>

      <view className="apiListContent">
        {apiList.map((api, index) => (
          <view
            key={index}
            className="apiListItem"
            bindtap={() => onNavigate(`/api/${api.name}`)}
          >
            <view className="apiListItemLeft">
              <view className="apiListItemIcon">
                <text className="apiListItemIconText">{api.name.charAt(0)}</text>
              </view>
              <view className="apiListItemInfo">
                <text className="apiListItemName">{api.name}</text>
                <text className="apiListItemDesc">{api.description}</text>
              </view>
            </view>
            <text className="apiListItemArrow">{'>'}</text>
          </view>
        ))}
      </view>
    </view>
  );
};

export default ApiList;
