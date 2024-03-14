import { FuseResult } from 'fuse.js';
import React, { useRef, useState } from 'react';
import { Preset } from './types';

const PresetCard = ({
  preset,
  setSelectedPreset,
}: {
  preset: Preset;
  setSelectedPreset: (preset: Preset) => void;
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current || isFocused) {return;}

    const div = divRef.current;
    const rect = div.getBoundingClientRect();

    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleFocus = () => {
    setIsFocused(true);
    setOpacity(1);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setOpacity(0);
  };

  const handleMouseEnter = () => {
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <div
      onClick={() => setSelectedPreset(preset)}
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative w-full rounded border border-gray-750 bg-gradient-to-r from-gray-700 to-gray-700 px-4 py-8"
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(255,255,255,.1), transparent 40%)`,
        }}
      />
      <div className="space-y-2">
        <div className="h-12 w-12  rounded-full bg-gray-750 p-2">
          <img src={preset.icon} alt="" />
        </div>
        <h3 className="line-clamp-1 text-lg font-semibold text-gray-100">
          {preset.metadata.jobTitle}
        </h3>
        <p className="line-clamp-3 text-sm text-gray-400">{preset.metadata.marketingText}</p>
      </div>
    </div>
  );
};

export default PresetCard;
