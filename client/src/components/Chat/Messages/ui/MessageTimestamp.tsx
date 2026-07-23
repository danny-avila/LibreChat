import { useTranslation } from 'react-i18next';
import useTimeTick from '~/hooks/useTimeTick';
import { getMessageTimestamp } from '~/utils';

type Timestamp = NonNullable<ReturnType<typeof getMessageTimestamp>>;

function TimestampText({ timestamp }: { timestamp: Timestamp }) {
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

/** Only recent timestamps subscribe to the shared minute ticker, so the
 * per-minute sweep re-renders a handful of rows instead of every message. */
function RecentTimestamp({ value, language }: { value?: string | null; language: string }) {
  useTimeTick();
  const timestamp = getMessageTimestamp(value, language);

  if (!timestamp) {
    return null;
  }

  return <TimestampText timestamp={timestamp} />;
}

/**
 * Inline message timestamp shown next to the author name in the message header.
 * On hover-capable pointers it reveals on row hover/focus; on touch and other
 * non-hover devices it stays visible. Recent messages show the relative form
 * ("10 minutes ago") with the absolute date on hover; older messages show the
 * absolute date directly.
 */
export default function MessageTimestamp({ value }: { value?: string | null }) {
  const { i18n } = useTranslation();
  const timestamp = getMessageTimestamp(value, i18n.language);

  if (!timestamp) {
    return null;
  }

  if (timestamp.isRecent) {
    return <RecentTimestamp value={value} language={i18n.language} />;
  }

  return <TimestampText timestamp={timestamp} />;
}
