import type { ReactNode } from 'react';
import { cn } from '~/utils';

export function parseShortcutKeys(display: string): string[] {
  return display.split(/([+\s]+)/).filter((key) => key.trim().length > 0 && key !== '+');
}

function ShortcutKbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-[7px] border border-border-medium bg-surface-primary-alt px-1.5 font-sans text-[11.5px] font-semibold leading-none text-text-primary shadow-[0_1px_0_0_rgba(0,0,0,0.06),inset_0_-1px_0_0_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04),inset_0_-1px_0_0_rgba(0,0,0,0.4)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export default function ShortcutKeyCombo({
  display,
  keys,
  className = '',
  keyClassName = '',
}: {
  display?: string;
  keys?: string[];
  className?: string;
  keyClassName?: string;
}) {
  const shortcutKeys = keys ?? parseShortcutKeys(display ?? '');

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {shortcutKeys.map((key, idx) => (
        <ShortcutKbd key={`${key}-${idx}`} className={keyClassName}>
          {key}
        </ShortcutKbd>
      ))}
    </div>
  );
}
