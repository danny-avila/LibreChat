import { useTranslation } from 'react-i18next';
import useTimeTick from '~/hooks/useTimeTick';
import { getMessageTimestamp } from '~/utils';

/**
 * Inline message timestamp shown next to the author name in the message header.
 * On hover-capable pointers it reveals on row hover/focus; on touch and other
 * non-hover devices it stays visible. Recent messages show the relative form
 * ("10 minutes ago") with the absolute date on hover; older messages show the
 * absolute date directly.
 */
export default function MessageTimestamp({ value }: { value?: string | null }) {
  const { i18n } = useTranslation();
  // Re-render on a shared interval so relative labels stay current while idle.
  useTimeTick();
  const timestamp = getMessageTimestamp(value, i18n.language);

  if (!timestamp) {
    return null;
  }

  return (
    <time
      dateTime={timestamp.iso}
      title={timestamp.isRecent ? timestamp.absolute : undefined}
      className="ml-2 text-xs font-normal text-text-secondary transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
    >
      {timestamp.isRecent ? timestamp.relative : timestamp.absolute}
    </time>
  );
}
