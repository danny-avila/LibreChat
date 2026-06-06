import React from 'react';
import { ECallState } from 'librechat-data-provider';
import { CircleIcon, CircleDotsIcon } from '@librechat/client';

const CircleRender = ({ rmsLevel, isCameraOn, state }) => {
  const getIconComponent = (state) => {
    switch (state) {
      case ECallState.Thinking:
        return <CircleDotsIcon />;
      default:
        return (
          <div className="smooth-transition" style={{ transform: `scale(${transformScale})` }}>
            <CircleIcon state={state} size="256" />
          </div>
        );
    }
  };

  const getScaleMultiplier = (level: number): number => {
    if (level > 0.08) return 1.8;
    if (level > 0.07) return 1.6;
    if (level > 0.05) return 1.4;
    if (level > 0.01) return 1.2;
    return 1;
  };

  const baseScale = isCameraOn ? 0.5 : 1;
  const scaleMultiplier = getScaleMultiplier(rmsLevel);
  const transformScale = baseScale * scaleMultiplier;

  return getIconComponent(state);
};

export default CircleRender;
