import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '~/utils';

interface AdvancedProps {
  label: string;
  count: number;
  children: ReactNode;
}

export default function Advanced({ label, count, children }: AdvancedProps) {
  const [open, setOpen] = useState(false);
  const regionId = useId();

  return (
    <section className="mb-2 border-t border-border-light pt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <span>
          {label}
          <span className="ml-2 text-text-tertiary">{count}</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={regionId} className="mt-3 flex flex-col gap-3">
          {children}
        </div>
      )}
    </section>
  );
}
