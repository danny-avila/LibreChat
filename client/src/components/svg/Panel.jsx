import { cn } from '~/utils/';

export default function Panel({ open = false, className }) {
  const openPanel = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('lucide lucide-panel-right-close', className)}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <line x1="15" x2="15" y1="3" y2="21" />
      <path d="m8 9 3 3-3 3" />
    </svg>
  );

  const closePanel = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('lucide lucide-panel-left-close', className)}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <path d="M9 3v18" />
      <path d="m16 15-3-3 3-3" />
    </svg>
  );

  if (open) {
    return openPanel;
  } else {
    return closePanel;
  }
}
