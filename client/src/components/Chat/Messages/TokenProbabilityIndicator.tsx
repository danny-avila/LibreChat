import React, { memo, useMemo } from 'react';
import { cn } from '~/utils';

type TokenProbabilityIndicatorProps = {
  value: number; // Value between 0 and 100
  size?: number; // Size in pixels
  strokeWidth?: number;
  className?: string;
};

const TokenProbabilityIndicator = memo(
  ({ value, size = 16, strokeWidth = 2, className }: TokenProbabilityIndicatorProps) => {
    // Clamp value between 0 and 100
    const clampedValue = useMemo(() => Math.max(0, Math.min(100, value)), [value]);

    // Calculate circle dimensions
    const center = 60; // Center of viewBox (120/2)
    // Calculate scaled stroke width for the viewBox
    const scaledStrokeWidth = useMemo(() => strokeWidth * (120 / size), [strokeWidth, size]);
    // Radius should account for half the stroke width so the circle fits properly within viewBox
    const radius = useMemo(() => center - scaledStrokeWidth / 2, [scaledStrokeWidth]);
    const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);

    // Calculate stroke-dashoffset: at 50%, half the circle should be filled
    const offset = useMemo(
      () => circumference - (clampedValue / 100) * circumference,
      [circumference, clampedValue],
    );

    // Muted linear color progression from red (0%) -> yellow (50%) -> muted green (100%)
    const getColor = (val: number): string => {
      let r: number, g: number, b: number;

      if (val <= 50) {
        // Muted Red to Muted Yellow: 0-50%
        const ratio = val / 50;
        r = 220;
        g = Math.round(100 + 120 * ratio);
        b = Math.round(100 + 50 * ratio);
      } else {
        // Muted Yellow to Muted Green: 50-100%
        const ratio = (val - 50) / 50;
        r = Math.round(220 - 140 * ratio);
        g = Math.round(220 - 60 * ratio);
        b = Math.round(150 - 30 * ratio);
      }

      return `rgb(${r}, ${g}, ${b})`;
    };

    const displayValue = Math.round(clampedValue);
    const progressColor = useMemo(() => getColor(clampedValue), [clampedValue]);
    const textColor = useMemo(() => getColor(clampedValue), [clampedValue]);

    return (
      <div
        className={cn('flex items-center gap-2', className)}
        title={`Token Probability: ${displayValue}%`}
      >
        {/* Progress ring circle */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 120 120"
          className="relative flex-shrink-0"
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Background circle (unfilled ring) */}
          <circle
            className="stroke-gray-200 dark:stroke-gray-700"
            strokeWidth={scaledStrokeWidth}
            fill="transparent"
            r={radius}
            cx={center}
            cy={center}
          />
          {/* Progress circle (filled ring) - color changes from red to yellow to green */}
          <circle
            className="transition-[stroke-dashoffset] duration-300"
            stroke={progressColor}
            strokeWidth={scaledStrokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={center}
            cy={center}
            style={{ opacity: 0.85 }}
          />
        </svg>

        {/* Value text - to the right of the circle */}
        <span
          className="text-xs font-medium leading-none text-text-secondary-alt"
          style={{ color: textColor }}
        >
          {displayValue}%
        </span>
      </div>
    );
  },
);

TokenProbabilityIndicator.displayName = 'TokenProbabilityIndicator';

export default TokenProbabilityIndicator;
