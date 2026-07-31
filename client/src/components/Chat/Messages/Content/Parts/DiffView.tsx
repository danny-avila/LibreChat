import { cn } from '~/utils';

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export interface DiffLine {
  type: 'add' | 'del' | 'context' | 'hunk';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface ParsedDiff {
  lines: DiffLine[];
  additions: number;
  deletions: number;
  hasLineNumbers: boolean;
}

/**
 * Parses unified-diff text into typed lines with old/new line numbers when the
 * hunk headers carry them. Also understands the argless `@@` separators and
 * `--- old_text` / `+++ new_text` markers the streaming args preview emits —
 * file headers and `\ No newline` markers are dropped (the window header
 * already names the file).
 */
export function parseUnifiedDiff(diff: string): ParsedDiff {
  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  let hasLineNumbers = false;
  let oldLine: number | undefined;
  let newLine: number | undefined;

  for (const raw of diff.replace(/\n$/, '').split('\n')) {
    if (raw.startsWith('--- ') || raw.startsWith('+++ ') || raw.startsWith('\\')) {
      continue;
    }
    const hunk = HUNK_HEADER.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      hasLineNumbers = true;
      lines.push({ type: 'hunk', text: raw });
      continue;
    }
    if (raw === '@@') {
      oldLine = undefined;
      newLine = undefined;
      lines.push({ type: 'hunk', text: '' });
      continue;
    }
    if (raw.startsWith('+')) {
      additions += 1;
      lines.push({ type: 'add', text: raw.slice(1), newLine });
      newLine = newLine == null ? undefined : newLine + 1;
      continue;
    }
    if (raw.startsWith('-')) {
      deletions += 1;
      lines.push({ type: 'del', text: raw.slice(1), oldLine });
      oldLine = oldLine == null ? undefined : oldLine + 1;
      continue;
    }
    lines.push({
      type: 'context',
      text: raw.startsWith(' ') ? raw.slice(1) : raw,
      oldLine,
      newLine,
    });
    oldLine = oldLine == null ? undefined : oldLine + 1;
    newLine = newLine == null ? undefined : newLine + 1;
  }

  return { lines, additions, deletions, hasLineNumbers };
}

const LINE_NUMBER_CLASS = 'w-9 shrink-0 select-none pr-1.5 text-right text-text-tertiary';

const LINE_MARKERS: Record<DiffLine['type'], string> = {
  add: '+',
  del: '-',
  context: '',
  hunk: '',
};

export default function DiffView({ parsed }: { parsed: ParsedDiff }) {
  const { lines, hasLineNumbers } = parsed;
  const firstContentIndex = lines.findIndex((line) => line.type !== 'hunk');

  return (
    <div
      data-testid="diff-view"
      className="max-h-[300px] overflow-auto bg-surface-chat py-2 font-mono text-xs leading-5 dark:bg-surface-primary-alt"
    >
      {lines.map((line, index) => {
        if (line.type === 'hunk') {
          if (index < firstContentIndex || firstContentIndex === -1) {
            return null;
          }
          if (!line.text) {
            return <div key={index} className="mx-3 my-1.5 border-t border-border-light" />;
          }
          return (
            <div key={index} className="select-none px-3 py-0.5 text-[11px] text-text-tertiary">
              {line.text}
            </div>
          );
        }
        return (
          <div
            key={index}
            className={cn(
              'flex',
              line.type === 'add' && 'bg-green-500/10',
              line.type === 'del' && 'bg-red-500/10',
            )}
          >
            {hasLineNumbers && (
              <>
                <span className={LINE_NUMBER_CLASS}>{line.oldLine ?? ''}</span>
                <span className={LINE_NUMBER_CLASS}>{line.newLine ?? ''}</span>
              </>
            )}
            <span
              className={cn(
                'w-6 shrink-0 select-none text-center font-semibold',
                line.type === 'add' && 'text-green-600 dark:text-green-400',
                line.type === 'del' && 'text-red-600 dark:text-red-400',
              )}
            >
              {LINE_MARKERS[line.type]}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3 text-text-primary">
              {line.text || ' '}
            </span>
          </div>
        );
      })}
    </div>
  );
}
