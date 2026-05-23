import { cn } from '~/utils/';

interface SpinnerProps {
  className?: string;
  size?: string | number;
  color?: string;
  bgOpacity?: number;
  speed?: number;
}

export default function Spinner({
  className = 'm-auto',
  size = 20,
  color = 'currentColor',
  bgOpacity = 0.1,
  speed = 0.75,
}: SpinnerProps) {
  const cssVars = {
    '--spinner-speed': `${speed}s`,
  } as React.CSSProperties;

  return (
    <svg
      className={cn(className, 'spinner')}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      style={cssVars}
      aria-hidden="true"
    >
      <defs>
        <style type="text/css">{`
          .spinner {
            transform-origin: center;
            overflow: visible;
            animation: spinner-rotate var(--spinner-speed) linear infinite;
          }
          @keyframes spinner-rotate {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </defs>

      <circle
        cx="20"
        cy="20"
        r="14.5"
        pathLength="100"
        strokeWidth="5"
        fill="none"
        stroke={color}
        strokeOpacity={bgOpacity}
      />
      <circle
        cx="20"
        cy="20"
        r="14.5"
        pathLength="100"
        strokeWidth="5"
        fill="none"
        stroke={color}
        strokeDasharray="25 75"
        strokeLinecap="round"
      />
    </svg>
  );
}
