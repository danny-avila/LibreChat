import { useState, useMemo } from 'react';
import { useLocalize } from '~/hooks';
import { detectOutputType, OutputType } from './detectOutputType';
import TableOutput from './TableOutput';
import ErrorOutput from './ErrorOutput';

const MAX_LINES = 8;

function TruncatedOutput({ text }: { text: string }) {
  const localize = useLocalize();
  const [showAll, setShowAll] = useState(false);

  const formatted = useMemo(() => {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return text;
      }
    }
    return text;
  }, [text]);

  const lines = useMemo(() => formatted.split('\n'), [formatted]);
  const needsTruncation = lines.length > MAX_LINES;

  const displayText =
    needsTruncation && !showAll ? lines.slice(0, MAX_LINES).join('\n') + '\n...' : formatted;

  return (
    <div>
      <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-tertiary p-3 font-mono text-xs text-text-primary">
        <code>{displayText}</code>
      </pre>
      {needsTruncation && (
        <button
          type="button"
          className="mt-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
          onClick={() => setShowAll((prev) => !prev)}
        >
          {showAll ? localize('com_ui_show_less') : localize('com_ui_show_more')}
        </button>
      )}
    </div>
  );
}

interface OutputRendererProps {
  text: string;
}

export default function OutputRenderer({ text }: OutputRendererProps) {
  const detected = useMemo(() => detectOutputType(text), [text]);

  if (detected.type === OutputType.ERROR) {
    return <ErrorOutput text={text} />;
  }

  if (detected.type === OutputType.TABLE) {
    return <TableOutput data={detected.parsed as Record<string, unknown>[]} />;
  }

  return <TruncatedOutput text={text} />;
}
