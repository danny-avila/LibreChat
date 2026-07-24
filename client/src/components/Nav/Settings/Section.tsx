import type { ReactNode } from 'react';
import { cn } from '~/utils';

interface SectionProps {
  heading: string;
  icon?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}

export default function Section({ heading, icon, danger, children }: SectionProps) {
  return (
    <section className="mb-7">
      <h3
        className={cn(
          'mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide',
          danger ? 'text-red-500' : 'text-text-secondary',
        )}
      >
        {icon}
        {heading}
      </h3>
      <div
        className={cn(
          'divide-y divide-border-light overflow-hidden rounded-xl border text-sm text-text-primary',
          danger ? 'border-red-500/30' : 'border-border-light',
        )}
      >
        {children}
      </div>
    </section>
  );
}
