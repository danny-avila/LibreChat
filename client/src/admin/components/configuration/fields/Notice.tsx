import type { ReactNode } from 'react';

/** Inline status under a control (e.g. why a value could not be cleared); not an error. */
export function FieldNotice({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} role="status" className="text-xs text-(--cui-color-text-muted)">
      {children}
    </span>
  );
}
