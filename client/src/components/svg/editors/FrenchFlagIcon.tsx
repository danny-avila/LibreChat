import React from 'react';

interface Props {
  size?: number;
  className?: string;
}

export default function FrenchFlagIcon({ size = 20, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 3 2"
      className={className}
      aria-hidden="true"
      style={{ borderRadius: '2px', overflow: 'hidden' }}
    >
      <rect x="0" y="0" width="1" height="2" fill="#0055A4" />
      <rect x="1" y="0" width="1" height="2" fill="#FFFFFF" />
      <rect x="2" y="0" width="1" height="2" fill="#EF4135" />
    </svg>
  );
}
