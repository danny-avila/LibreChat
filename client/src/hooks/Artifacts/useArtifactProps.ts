import { useContext, useMemo } from 'react';
import { ThemeContext, isDark } from '@librechat/client';
import { removeNullishValues } from 'librechat-data-provider';
import type { Artifact } from '~/common';
import {
  getKey,
  getProps,
  getTemplate,
  getArtifactFilename,
  languageForFilename,
  TOOL_ARTIFACT_TYPES,
} from '~/utils/artifacts';
import { getMarkdownFiles } from '~/utils/markdown';
import { getMermaidFiles } from '~/utils/mermaid';

/**
 * Find the longest run of backticks at the start of any line in `source`.
 * CommonMark closes a fenced code block on a line whose leading
 * backticks match-or-exceed the opener, so the fence we emit must have
 * STRICTLY MORE backticks than any such run inside the payload —
 * otherwise a markdown snippet inside a JS template literal (or any
 * file that happens to contain ` ``` ` at column zero) closes our
 * outer fence early and the rest renders as plain markdown,
 * corrupting the artifact.
 */
function longestLeadingBacktickRun(source: string): number {
  let max = 0;
  /* Use multiline mode + start-of-line anchor so the regex catches
   * runs at line boundaries throughout the file, not just at index 0. */
  const re = /^(`+)/gm;
  for (let m = re.exec(source); m !== null; m = re.exec(source)) {
    if (m[1].length > max) max = m[1].length;
  }
  return max;
}

/**
 * Wrap raw source as a fenced markdown code block so the CODE bucket
 * can ride the existing markdown rendering pipeline — `marked` emits
 * `<pre><code class="language-<lang>">…</code></pre>` and the future
 * highlighter swap-in (currently the markdown template uses plain
 * `marked` with no syntax colors) will pick up `language-<lang>`
 * automatically. Pure; deterministic; safe on empty input (renders an
 * empty fenced block which marked handles cleanly).
 *
 * Fence length is adaptive: the emitted opener/closer use 3 backticks
 * by default, but bumps to (longest-leading-run-in-source + 1) when
 * the source contains ` ``` ` (or longer) at the start of any line.
 * This is the CommonMark-spec way to embed a fenced block inside
 * another fenced block — see e.g. the markdown spec's nested-fence
 * examples — and avoids the early-close attack on artifacts whose
 * source is itself markdown-shaped.
 */
export function wrapAsFencedCodeBlock(source: string, lang: string): string {
  const langHint = lang ? lang : '';
  const fenceLength = Math.max(3, longestLeadingBacktickRun(source) + 1);
  const fence = '`'.repeat(fenceLength);
  /* Trim a single trailing newline (common in extractor output) so the
   * fence's closing ``` lands on its own line rather than after a blank
   * gap that marked would render as an extra <br>. */
  const body = source.endsWith('\n') ? source.slice(0, -1) : source;
  return fence + langHint + '\n' + body + '\n' + fence;
}

export default function useArtifactProps({ artifact }: { artifact: Artifact }) {
  const { theme } = useContext(ThemeContext);
  const isDarkMode = isDark(theme);

  const [fileKey, files] = useMemo(() => {
    const key = getKey(artifact.type ?? '', artifact.language);
    const type = artifact.type ?? '';

    if (key.includes('mermaid')) {
      return ['diagram.mmd', getMermaidFiles(artifact.content ?? '', isDarkMode)];
    }

    /* CODE bucket: source files render through the same static-markdown
     * pipeline as .md artifacts, but the raw source is wrapped in a
     * fenced code block first so `marked` outputs
     * `<pre><code class="language-<lang>">…</code></pre>` instead of
     * paragraph text. The language hint comes from the artifact's
     * filename (set as `title` by `fileToArtifact`). */
    if (type === TOOL_ARTIFACT_TYPES.CODE) {
      const lang = languageForFilename(artifact.title);
      const wrapped = wrapAsFencedCodeBlock(artifact.content ?? '', lang);
      return ['content.md', getMarkdownFiles(wrapped)];
    }

    if (type === 'text/markdown' || type === 'text/md' || type === 'text/plain') {
      return ['content.md', getMarkdownFiles(artifact.content ?? '')];
    }

    const fileKey = getArtifactFilename(artifact.type ?? '', artifact.language);
    const files = removeNullishValues({
      [fileKey]: artifact.content,
    });
    return [fileKey, files];
  }, [artifact.type, artifact.content, artifact.language, artifact.title, isDarkMode]);

  const template = useMemo(
    () => getTemplate(artifact.type ?? '', artifact.language),
    [artifact.type, artifact.language],
  );

  const sharedProps = useMemo(() => getProps(artifact.type ?? ''), [artifact.type]);

  return {
    files,
    fileKey,
    template,
    sharedProps,
  };
}
