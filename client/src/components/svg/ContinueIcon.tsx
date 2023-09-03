import { cn } from '~/utils';

export default function ContinueIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-3 w-3 -rotate-180', className)}
      height="1em"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon points="11 19 2 12 11 5 11 19" />
      <polygon points="22 19 13 12 22 5 22 19" />
    </svg>
  );
}
