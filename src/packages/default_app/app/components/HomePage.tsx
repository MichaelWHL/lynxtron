import React, { useState, useCallback } from '@lynx-js/react';
import FeatureGrid from './FeatureGrid';

interface HomePageProps {
  onStart: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onStart }) => {
  const [clicked, setClicked] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleTap = useCallback(() => {
    console.log('[HomePage] bindtap fired!');
    setClicked(true);
    onStart();
  }, [onStart]);

  const handleTap1 = useCallback(() => {
    console.log('[HomePage] bindtap fired!');
    setClicked(true);
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  return (
    <view className="container">
      <view className="header">
        <text className="logo">My App</text>
        <view className="statusBadge">
          <view className="statusDot" />
          <text className="statusText">Running</text>
        </view>
      </view>

      <view className="hero">
        <text className="greeting">Welcome to Lynxtron</text>
        <text className="title">HarmonyOS Desktop{clicked ? ' TAPPED' : ''}</text>
        <text className="subtitle">
          A lightweight, high-performance application framework powered by Lynx.
          Build fast, native-quality apps for HarmonyOS.
        </text>
        <view className="startButton" bindtap={handleTap1}>
          <text className="startButtonText">{clicked ? 'Clicked!' : 'Start'}</text>
        </view>
        <view className="divider" />
      </view>

      <view className="content">
        <text className="sectionTitle">Features</text>
        <FeatureGrid />
      </view>

      {showModal && (
        <view className="modalOverlay" bindtap={handleCloseModal}>
          <view className="modalBox" bindtap={(e: any) => e.stopPropagation && e.stopPropagation()}>
            <text className="modalTitle">Welcome!</text>
            <text className="modalMessage">
              Lynxtron is ready. Explore the features and build amazing HarmonyOS apps.
            </text>
            <view className="modalButton" bindtap={handleCloseModal}>
              <text className="modalButtonText">Got it</text>
            </view>
          </view>
        </view>
      )}
    </view>
  );
};

export default HomePage;
