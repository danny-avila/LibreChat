import React from 'react';
import { ECallState } from 'librechat-data-provider';
import { Loader2, Circle } from 'lucide-react';

const CircleRender = ({ rmsLevel, isCameraOn, state }) => {
  const getIconComponent = (state) => {
    switch (state) {
      case ECallState.Thinking:
        return <Loader2 className="w-8 h-8 animate-spin" />;
      default:
        return (
          <div className="smooth-transition" style={{ transform: `scale(${transformScale})` }}>
            <Circle className="w-8 h-8" />
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
