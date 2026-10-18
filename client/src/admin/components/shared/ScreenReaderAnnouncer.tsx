import type * as t from '~/admin/types';

export function ScreenReaderAnnouncer({ message }: t.ScreenReaderAnnouncerProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
