import type { ReactNode } from 'react';

export default function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {heading}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
