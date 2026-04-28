import React from 'react';

type Props = {
  size?: number;
  radius?: number;
  className?: string;
};

export default function CodeCanBrandIcon({ size = 28, radius = 7, className }: Props) {
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        flex: '0 0 auto',
        display: 'inline-block',
        lineHeight: 0,
      }}
    >
      <svg viewBox="0 0 1024 1024" width={size} height={size} aria-hidden="true">
        <rect width="1024" height="1024" fill="#0B2F5B" />
        <rect x="262" y="220" width="560" height="604" rx="10" fill="#EAF2FF" />
        <rect x="242" y="200" width="560" height="604" rx="10" fill="#F6F9FF" />
        <path
          d="M 222 180 H 762 A 10 10 0 0 1 772 190 V 740 L 652 780 L 222 780 Z"
          fill="#FFFFFF"
        />
        <path d="M 772 740 L 652 780 L 772 780 Z" fill="#D9E3F2" />
        <g transform="translate(252 220)">
          <rect x="20" y="30" width="280" height="22" rx="6" fill="#0B2F5B" />
          <rect x="20" y="64" width="180" height="12" rx="4" fill="#7C8AA3" />
        </g>
      </svg>
    </span>
  );
}
