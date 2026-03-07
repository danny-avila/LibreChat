import { useMemo } from 'react';

interface ContentBlock {
  type?: string;
  text?: string;
}

function extractText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return (parsed as ContentBlock[])
          .filter((block) => typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n')
          .trim();
      }
      if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as ContentBlock;
        if (typeof obj.text === 'string') {
          return obj.text.trim();
        }
      }
    } catch {
      // Not JSON — fall through to raw text
    }
  }

  return trimmed;
}

interface OutputRendererProps {
  text: string;
}

export default function OutputRenderer({ text }: OutputRendererProps) {
  const displayText = useMemo(() => extractText(text), [text]);

  if (!displayText) {
    return null;
  }

  return (
    <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words text-xs text-text-secondary">
      {displayText}
    </pre>
  );
}
