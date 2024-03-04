import { cn } from '~/utils';

export default function SendIcon({ size = 24, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={'0 0 24 24'}
      fill="none"
      className={cn('text-white dark:text-black', className)}
    >
      <path
        d="M7 11L12 6L17 11M12 18V7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
