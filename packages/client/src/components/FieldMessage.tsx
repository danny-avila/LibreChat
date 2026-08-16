import * as React from 'react';
import { cn } from '~/utils';

export interface FieldMessageProps {
  id: string;
  /** Validation failure text; takes precedence over the hint */
  message?: string | null;
  /** Resting helper text shown while the field is valid */
  hint?: string | null;
  className?: string;
}

/**
 * Helper line rendered under a form field. It always occupies a single line of
 * space, so swapping between the hint, an error, and nothing never shifts the
 * surrounding layout.
 */
function FieldMessage({ id, message, hint, className }: FieldMessageProps): React.JSX.Element {
  return (
    <p
      id={id}
      role={message ? 'alert' : undefined}
      className={cn(
        'min-h-4 text-xs leading-4',
        message ? 'text-text-destructive' : 'text-text-secondary',
        className,
      )}
    >
      {message || hint || ''}
    </p>
  );
}

export { FieldMessage };
