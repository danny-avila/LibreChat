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
 * Wrap raw source as a fenced markdown code block so the CODE bucket
 * can ride the existing markdown rendering pipeline — `marked` emits
 * `<pre><code class="language-<lang>">…</code></pre>` and the future
 * highlighter swap-in (currently the markdown template uses plain
 * `marked` with no syntax colors) will pick up `language-<lang>`
 * automatically. Pure; deterministic; safe on empty input (renders an
 * empty fenced block which marked handles cleanly).
 *
 * The fence-terminator preamble ` \n` ensures we never collide with a
 * code-final ``` inside the source: backticks of any length inside the
 * source are quoted because we use exactly three backticks at column
 * zero, and any input that happens to start with backticks at column
 * zero would be unusual but still rendered intact (marked treats them
 * as content inside the outer fence).
 */
export function wrapAsFencedCodeBlock(source: string, lang: string): string {
  const langHint = lang ? lang : '';
  /* Trim a single trailing newline (common in extractor output) so the
   * fence's closing ``` lands on its own line rather than after a blank
   * gap that marked would render as an extra <br>. */
  const body = source.endsWith('\n') ? source.slice(0, -1) : source;
  return '```' + langHint + '\n' + body + '\n```';
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
