/**
 * Strips repetitive boilerplate from `@librechat/agents` code-execution
 * tool output before LibreChat re-injects it into the assistant's
 * conversation history.
 *
 * The bash executor in `@librechat/agents` appends two kinds of noise
 * to every successful run:
 *
 * 1. **Trailing "Note:" paragraphs** — long behavioral hints repeating
 *    rules the agent already has via its system prompt
 *    ("Files from previous executions are automatically available...",
 *    "Files in 'Available files' are inputs..."). Re-stating them on
 *    every tool call wastes tokens at scale (50+ tokens × N tool calls).
 *
 * 2. **Per-file annotations** — each file in the `Generated files:` /
 *    `Available files (...):` lists gets a `| <annotation>` suffix
 *    (`File is already downloaded by the user`,
 *    `Image is already displayed to the user`,
 *    `Available as an input — already known to the user`). The two
 *    section headers already convey the new-vs-known distinction; the
 *    per-file annotations are redundant *and* phrased inconsistently
 *    ("downloaded" vs. "displayed" vs. "known to the user").
 *
 * Stripping happens in LibreChat (this file), not upstream, so the
 * cleaning is reversible — pin to a specific upstream version and the
 * patterns adjust here without releasing a new agents build. The
 * patterns are anchored conservatively: only the documented forms are
 * matched, so a future upstream string change leaves user-authored
 * `Note:` lines (or legitimate `|`-delimited filenames) untouched.
 */

/**
 * Matches the per-file `| <annotation>` suffix the bash executor adds to
 * each file in `Generated files:` / `Available files (...):`. Two listing
 * formats: line-per-file (≥ 4 files) and inline comma-separated (≤ 3
 * files: `- /mnt/a.txt | <ann>, - /mnt/b.txt | <ann>`). The non-greedy
 * `[^,\n]*?` plus the `(?=,|\n|$)` boundary stops the match at either
 * end-of-line or the inline `, ` separator so an inline list strips
 * each file's annotation independently.
 */
const PER_FILE_ANNOTATION_PATTERN =
  /\s*\|\s*(?:File is already downloaded by the user|Image is already displayed to the user|Available as an input[^,\n]*?)(?=,|\n|$)/g;

const TRAILING_NOTES_PATTERN = /\n\s*\n\s*Note:[\s\S]*$/;

/**
 * Returns `content` with the bash-executor boilerplate removed. Safe
 * to call on any tool output — non-matching text is returned unchanged.
 */
export function cleanCodeToolOutput(content: string): string {
  if (!content) {
    return content;
  }
  const noAnnotations = content.replace(PER_FILE_ANNOTATION_PATTERN, '');
  const noTrailingNotes = noAnnotations.replace(TRAILING_NOTES_PATTERN, '');
  return noTrailingNotes.trimEnd();
}
