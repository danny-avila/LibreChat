import React from 'react';
import { Circle, CircleEllipsis } from 'lucide-react';

type CircleRenderProps = {
  rmsLevel: number;
  isCameraOn?: boolean;
  state?: string;
};

const CircleRender = ({ rmsLevel, isCameraOn, state }: CircleRenderProps) => {
  const getIconComponent = (callState?: string) => {
    switch (callState?.toLowerCase()) {
      case 'thinking':
        return <CircleEllipsis className="size-64" />;
      default:
        return (
          <div className="smooth-transition" style={{ transform: `scale(${transformScale})` }}>
            <Circle className="size-64" />
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
