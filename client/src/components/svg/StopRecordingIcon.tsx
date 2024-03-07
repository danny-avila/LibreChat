import { cn } from '~/utils';

export default function StopRecordingIcon({
  size,
  className = '',
}: Readonly<{
  size?: number;
  className?: string;
}>) {
  return (
    <svg
      fill="currentColor"
      viewBox={'0 0 448 512'}
      xmlns="http://www.w3.org/2000/svg"
      height={size}
      width={size}
      className={cn('text-black dark:text-white', className)}
    >
      <path d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48z"></path>
    </svg>
  );
}
