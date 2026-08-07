import { memo } from 'react';
import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { fontSizeAtom } from '~/store/fontSize';
import { cn } from '~/utils';

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
  const fontSize = useAtomValue(fontSizeAtom);
  return (
    <div className="relative -ml-9 flex w-[calc(100%+2.25rem)] gap-3" data-testid="author-header">
      <div className="relative flex flex-shrink-0 flex-col items-center">
        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          {icon}
        </div>
      </div>
      <h2 className={cn('select-none font-semibold text-text-primary', fontSize)}>{label}</h2>
    </div>
  );
});

export default AuthorHeader;
