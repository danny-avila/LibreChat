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
  wrapAsFencedCodeBlock,
  TOOL_ARTIFACT_TYPES,
} from '~/utils/artifacts';
import { getMarkdownFiles } from '~/utils/markdown';
import { getMermaidFiles } from '~/utils/mermaid';

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
     * paragraph text. The language hint is computed once at artifact
     * construction (`fileToArtifact` writes it to `artifact.language`)
     * so the MIME fallback fires for extensionless-filename + useful-
     * MIME inputs. Title-derived fallback covers older callers that
     * didn't set `language`. */
    if (type === TOOL_ARTIFACT_TYPES.CODE) {
      const lang = artifact.language ?? languageForFilename(artifact.title);
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
