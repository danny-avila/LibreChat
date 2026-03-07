import { useMemo } from 'react';
import { cn } from '~/utils';

interface ContentBlock {
  type?: string;
  text?: string;
}

const ERROR_PREFIX = /^Error:\s*(\[.*?\]\s*)*tool call failed:\s*/i;
const ERROR_INNER = /^Error\s+\w+ing to endpoint\s*\(HTTP \d+\):\s*/i;

function cleanError(text: string): string {
  let cleaned = text.replace(ERROR_PREFIX, '').trim();
  cleaned = cleaned.replace(ERROR_INNER, '').trim();
  if (cleaned.endsWith('Please fix your mistakes.')) {
    cleaned = cleaned.slice(0, -'Please fix your mistakes.'.length).trim();
  }
  return cleaned;
}

function isError(text: string): boolean {
  return ERROR_PREFIX.test(text) || text.startsWith('Error processing tool');
}

function formatValue(value: unknown, indent: number): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    if (value.every((v) => typeof v !== 'object' || v === null)) {
      return value.map(String).join(', ');
    }
    return value.map((item) => `${pad}${formatValue(item, indent + 1)}`).join('\n');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return entries
    .map(([k, v]) => {
      const formatted = formatValue(v, indent + 1);
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        return `${pad}${k}:\n${formatted}`;
      }
      return `${pad}${k}: ${formatted}`;
    })
    .join('\n');
}

function formatObjectArray(arr: Record<string, unknown>[]): string {
  const keys = Object.keys(arr[0]);
  const nameKey = keys.find((k) => /^(name|title|label|id)$/i.test(k));
  const descKey = keys.find((k) => /^(path|description|url|value|message)$/i.test(k));

  return arr
    .map((item) => {
      if (nameKey && descKey && item[descKey] !== undefined) {
        return `${item[nameKey]} — ${item[descKey]}`;
      }
      if (nameKey) {
        return String(item[nameKey]);
      }
      const values = Object.values(item).filter(
        (v) => typeof v === 'string' || typeof v === 'number',
      );
      return values.join(' — ');
    })
    .join('\n');
}

function isUniformObjectArray(parsed: unknown): parsed is Record<string, unknown>[] {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return false;
  }
  const first = parsed[0];
  if (typeof first !== 'object' || first === null || Array.isArray(first)) {
    return false;
  }
  const keys = Object.keys(first).sort().join(',');
  for (let i = 1, len = Math.min(parsed.length, 5); i < len; i++) {
    const item = parsed[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return false;
    }
    if (Object.keys(item).sort().join(',') !== keys) {
      return false;
    }
  }
  return true;
}

function extractText(raw: string): { text: string; error: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { text: '', error: false };
  }

  if (isError(trimmed)) {
    return { text: cleanError(trimmed), error: true };
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        const textBlocks = parsed.filter(
          (b: ContentBlock) => typeof b === 'object' && b !== null && typeof b.text === 'string',
        );
        if (textBlocks.length > 0) {
          const joined = (textBlocks as ContentBlock[])
            .map((b) => b.text)
            .join('\n')
            .trim();
          if (isError(joined)) {
            return { text: cleanError(joined), error: true };
          }
          return { text: joined, error: false };
        }

        if (isUniformObjectArray(parsed)) {
          return { text: formatObjectArray(parsed), error: false };
        }
      }

      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const obj = parsed as ContentBlock;
        if (typeof obj.text === 'string') {
          const t = obj.text.trim();
          if (isError(t)) {
            return { text: cleanError(t), error: true };
          }
          return { text: t, error: false };
        }
      }

      return { text: formatValue(parsed, 0), error: false };
    } catch {
      // Not JSON
    }
  }

  return { text: trimmed, error: false };
}

interface OutputRendererProps {
  text: string;
}

export default function OutputRenderer({ text }: OutputRendererProps) {
  const { text: displayText, error } = useMemo(() => extractText(text), [text]);

  if (!displayText) {
    return null;
  }

  return (
    <pre
      className={cn(
        'max-h-[300px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs',
        error ? 'text-red-600 dark:text-red-400' : 'text-text-secondary',
      )}
    >
      {displayText}
    </pre>
  );
}
