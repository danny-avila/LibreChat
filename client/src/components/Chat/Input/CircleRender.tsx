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

  const baseScale = isCameraOn ? 0.5 : 1;
  const scaleMultiplier =
    rmsLevel > 0.08
      ? 1.8
      : rmsLevel > 0.07
        ? 1.6
        : rmsLevel > 0.05
          ? 1.4
          : rmsLevel > 0.01
            ? 1.2
            : 1;

  const transformScale = baseScale * scaleMultiplier;

  return getIconComponent(state);
};

export default CircleRender;
