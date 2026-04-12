import React, { memo, useMemo, useState } from 'react';
import { ArrowLeft, Eye, Code, FileText, FileQuestion } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@librechat/client';
import { useGetSkillFileContentQuery } from '~/data-provider';
import SkillMarkdownRenderer from './SkillMarkdownRenderer';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface SkillFileViewerProps {
  skillId: string;
  relativePath: string;
}

/** Strip YAML frontmatter and return structured fields + remaining body. */
function parseFrontmatter(raw: string): {
  fields: Array<{ key: string; value: string }>;
  body: string;
} {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('---')) {
    return { fields: [], body: raw };
  }
  const after = trimmed.slice(3);
  const closingIdx = after.indexOf('\n---');
  if (closingIdx === -1) {
    return { fields: [], body: raw };
  }

  const block = after.slice(0, closingIdx);
  const body = after.slice(closingIdx + 4).trim();

  const fields: Array<{ key: string; value: string }> = [];
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colon = line.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (!key) {
      continue;
    }
    // Collect multi-line YAML list items
    if (!value) {
      const items: string[] = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        const t = next.trim();
        if (!t.startsWith('-')) {
          break;
        }
        items.push(t.slice(1).trim());
        i++;
      }
      value = items.join(',');
    }
    if (value) {
      fields.push({ key, value });
    }
  }

  return { fields, body };
}

function SkillFileViewer({ skillId, relativePath }: SkillFileViewerProps) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { data, isLoading, isError } = useGetSkillFileContentQuery(skillId, relativePath);
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered');

  const isMarkdown = relativePath.endsWith('.md');
  const isImage = data?.mimeType?.startsWith('image/') ?? false;
  const isSkillMd = relativePath === 'SKILL.md';

  const rawUrl = useMemo(
    () => `/api/skills/${skillId}/files/${encodeURIComponent(relativePath)}?raw=true`,
    [skillId, relativePath],
  );

  // For markdown files, parse frontmatter for structured display
  const parsed = useMemo(() => {
    if (!isMarkdown || !data?.content) {
      return null;
    }
    return parseFrontmatter(data.content);
  }, [isMarkdown, data?.content]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-medium px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(`/skills/${skillId}`)}
          className="rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label="Back to skill"
        >
          <ArrowLeft className="size-4" />
        </button>
        <FileText className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="min-w-0 truncate text-sm font-medium text-text-primary">
          {data?.filename ?? relativePath}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Spinner className="size-6" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-secondary">
            <FileQuestion className="size-8" />
            <p className="text-sm">{localize('com_ui_skill_file_load_error')}</p>
          </div>
        )}

        {data && !isLoading && !isError && (
          <>
            {/* Binary image */}
            {data.isBinary && isImage && (
              <img
                src={rawUrl}
                alt={data.filename}
                className="max-h-[600px] max-w-full rounded-lg object-contain"
              />
            )}

            {/* Binary non-image */}
            {data.isBinary && !isImage && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-secondary">
                <FileQuestion className="size-8" />
                <p className="text-sm">{localize('com_ui_skill_file_binary')}</p>
                <a
                  href={rawUrl}
                  download
                  className="text-sm text-text-primary underline hover:no-underline"
                >
                  {localize('com_ui_skill_file_download')}
                </a>
              </div>
            )}

            {/* Markdown with frontmatter — structured display like SkillDetail */}
            {!data.isBinary && data.content != null && isMarkdown && parsed && (
              <div className="relative flex flex-1 flex-col overflow-hidden rounded-xl border border-border-medium bg-transparent p-5">
                {/* Toggle — top-right corner, overlaid */}
                <div className="absolute right-3 top-3 z-10">
                  <div
                    role="group"
                    className="inline-flex h-8 rounded-lg bg-surface-tertiary p-0.5 text-sm font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode('rendered')}
                      className={cn(
                        'flex items-center justify-center rounded-md px-1.5 transition-colors',
                        viewMode === 'rendered'
                          ? 'bg-surface-primary text-text-primary shadow-sm'
                          : 'text-text-secondary hover:text-text-primary',
                      )}
                      aria-pressed={viewMode === 'rendered'}
                    >
                      <Eye className="size-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('source')}
                      className={cn(
                        'flex items-center justify-center rounded-md px-1.5 transition-colors',
                        viewMode === 'source'
                          ? 'bg-surface-primary text-text-primary shadow-sm'
                          : 'text-text-secondary hover:text-text-primary',
                      )}
                      aria-pressed={viewMode === 'source'}
                    >
                      <Code className="size-5" />
                    </button>
                  </div>
                </div>

                {/* Frontmatter grid (rendered mode only, skip name/description for SKILL.md) */}
                {viewMode === 'rendered' && parsed.fields.length > 0 && (
                  <div className="mb-4 grid grid-cols-[max-content_1fr] items-baseline gap-x-8 gap-y-2">
                    {parsed.fields
                      .filter(
                        ({ key }) =>
                          !isSkillMd ||
                          (key.toLowerCase() !== 'name' && key.toLowerCase() !== 'description'),
                      )
                      .map(({ key, value }) => (
                        <React.Fragment key={key}>
                          <span className="text-xs capitalize text-text-secondary">{key}</span>
                          <span className="text-sm text-text-primary">{value}</span>
                        </React.Fragment>
                      ))}
                  </div>
                )}

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-auto">
                  {viewMode === 'rendered' ? (
                    <SkillMarkdownRenderer content={parsed.body} />
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-primary">
                      {data.content}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* Non-markdown text */}
            {!data.isBinary && data.content != null && !isMarkdown && (
              <pre className="overflow-x-auto rounded-lg border border-border-light bg-surface-secondary p-4 font-mono text-sm leading-relaxed text-text-primary">
                {data.content}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default memo(SkillFileViewer);
