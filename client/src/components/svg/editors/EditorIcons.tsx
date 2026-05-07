import React from 'react';
import { AnthropicIcon, OpenAIMinimalIcon, GoogleIcon } from '@librechat/client';
import FrenchFlagIcon from './FrenchFlagIcon';

interface IconProps {
  size?: number;
  className?: string;
  /** When false, the icon inherits color from parent (currentColor) instead of forcing brand color. */
  forceColor?: boolean;
}

export const OpenAIEditorIcon: React.FC<IconProps> = ({
  size = 20,
  className = '',
  forceColor = true,
}) => {
  const colorClass = forceColor ? '!text-black dark:!text-white' : '';
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <OpenAIMinimalIcon className={`h-full w-full ${colorClass}`.trim()} />
    </span>
  );
};

export const AnthropicEditorIcon: React.FC<IconProps> = ({
  size = 20,
  className = '',
  forceColor = true,
}) => {
  const colorClass = forceColor ? '!text-[#D97757]' : '';
  return (
    <AnthropicIcon size={size} className={`${colorClass} ${className}`.trim()} />
  );
};

export const GoogleEditorIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <span
    className={`inline-flex items-center justify-center ${className}`}
    style={{ width: size, height: size }}
    aria-hidden="true"
  >
    <GoogleIcon />
  </span>
);

export const FrenchAlpacaEditorIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <FrenchFlagIcon size={size} className={className} />
);
