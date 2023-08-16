import { cn, removeFocusOutlines } from '~/utils/';

export default function Button({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  return (
    <button
      data-testid="generation-button"
      className={cn(
        'custom-btn btn-neutral relative -z-0 whitespace-nowrap border-0 md:border',
        removeFocusOutlines,
        className,
      )}
      onClick={onClick}
    >
      <div className="flex w-full items-center justify-center gap-2">{children}</div>
    </button>
  );
}
