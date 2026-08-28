import { cn } from '~/utils';

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** The separator pair `formatEditPreview` writes ahead of each batched edit,
 *  numbered once a batch holds more than one. Only ever skipped as an adjacent
 *  pair sitting immediately before a hunk header; see `parseUnifiedDiff`. */
const OLD_TEXT_MARKER = /^--- old_text(?: \d+)?$/;
const NEW_TEXT_MARKER = /^\+\+\+ new_text(?: \d+)?$/;

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
 * `--- old_text` / `+++ new_text` markers the streaming args preview emits.
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
  let inHunk = false;

  const rawLines = diff.replace(/\n$/, '').split('\n');
  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index];
    /** `formatEditPreview` writes an `--- old_text N` / `+++ new_text N` pair
     *  ahead of EACH batched edit's `@@`, and `inHunk` never resets, so a
     *  `!inHunk` gate recognized only the first pair and counted every later
     *  one as a deletion plus an addition. Matching the marker names alone is
     *  not enough either: deleting a real `-- old_text` comment line (SQL,
     *  Lua) is prefixed to exactly `--- old_text`. So require separator
     *  POSITION: the pair adjacent and immediately followed by a hunk header,
     *  which no run of genuine content satisfies. */
    if (
      OLD_TEXT_MARKER.test(raw) &&
      NEW_TEXT_MARKER.test(rawLines[index + 1] ?? '') &&
      (rawLines[index + 2] ?? '').startsWith('@@')
    ) {
      index += 1;
      continue;
    }
    if (!inHunk && (raw.startsWith('--- ') || raw.startsWith('+++ '))) {
      continue;
    }
    if (raw.startsWith('\\')) {
      continue;
    }
    const hunk = HUNK_HEADER.exec(raw);
    if (hunk) {
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      hasLineNumbers = true;
      lines.push({ type: 'hunk', text: raw });
      continue;
    }
    if (raw === '@@') {
      inHunk = true;
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

const LINE_MARKERS: Record<DiffLine['type'], string> = {
  add: '+',
  del: '-',
  context: '',
  hunk: '',
};

/** One number per row keeps the gutter compact: the old line for removals
 *  (it no longer exists in the new file) and the new line otherwise. */
function lineNumber(line: DiffLine): number | undefined {
  return line.type === 'del' ? line.oldLine : (line.newLine ?? line.oldLine);
}

export default function DiffView({ parsed }: { parsed: ParsedDiff }) {
  const { lines, hasLineNumbers } = parsed;
  const firstContentIndex = lines.findIndex((line) => line.type !== 'hunk');

  return (
    <div
      data-testid="diff-view"
      className="max-h-[300px] overflow-y-auto bg-surface-chat py-2 font-mono text-xs leading-5 dark:bg-surface-primary-alt"
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
              line.type === 'add' && 'bg-status-success-subtle',
              line.type === 'del' && 'bg-status-error-subtle',
            )}
          >
            {hasLineNumbers && (
              <span className="w-9 shrink-0 select-none pr-1 text-right text-[11px] text-text-tertiary">
                {lineNumber(line) ?? ''}
              </span>
            )}
            <span
              className={cn(
                'shrink-0 select-none text-center font-semibold',
                hasLineNumbers ? 'w-5' : 'w-6',
                line.type === 'add' && 'text-status-success',
                line.type === 'del' && 'text-status-error',
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
