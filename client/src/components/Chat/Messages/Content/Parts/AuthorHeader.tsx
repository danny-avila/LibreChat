import { memo } from 'react';
import type { ReactNode } from 'react';

/**
 * Re-attributes response content to its author mid-message. A `SteerPart`
 * renders a full user turn inside the response, so the parts that resume
 * after it need the author's icon and label restated — the message-level
 * header only renders once, above the first part. Outdented past the icon
 * column (like `SteerPart`) so it aligns with the top-level header.
 */
const AuthorHeader = memo(function AuthorHeader({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="relative -ml-9 flex w-[calc(100%+2.25rem)] gap-3" data-testid="author-header">
      <div className="relative flex flex-shrink-0 flex-col items-center" aria-hidden="true">
        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          {icon}
        </div>
      </div>
      <h2 className="select-none text-sm font-semibold text-text-primary">{label}</h2>
    </div>
  );
});

export default AuthorHeader;
