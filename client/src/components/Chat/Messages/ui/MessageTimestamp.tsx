import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getMessageTimestamp } from '~/utils';

/**
 * Inline message timestamp shown next to the author name in the message header.
 * Reveals on row hover (desktop) and stays visible on touch. Recent messages show
 * the relative form ("10 minutes ago") with the absolute date on hover; older
 * messages show the absolute date directly.
 */
export default function MessageTimestamp({ value }: { value?: string | null }) {
  const { i18n } = useTranslation();
  const timestamp = useMemo(
    () => getMessageTimestamp(value, i18n.language),
    [value, i18n.language],
  );

  if (!timestamp) {
    return null;
  }

  return (
    <time
      dateTime={timestamp.iso}
      title={timestamp.isRecent ? timestamp.absolute : undefined}
      className="ml-2 text-xs font-normal text-text-secondary transition-opacity duration-200 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
    >
      {timestamp.isRecent ? timestamp.relative : timestamp.absolute}
    </time>
  );
}
