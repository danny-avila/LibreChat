import React, { memo, useMemo, useState, useCallback, useRef } from 'react';
import { ArrowLeft, Eye, Code, Copy, Check, FileText, FileQuestion } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Spinner, TooltipAnchor, useToastContext } from '@librechat/client';
import { useGetSkillFileContentQuery } from '~/data-provider';
import SkillMarkdownRenderer from './SkillMarkdownRenderer';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface SkillFileViewerProps {
  skillId: string;
  relativePath: string;
}

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
  const { showToast } = useToastContext();
  const { data, isLoading, isError } = useGetSkillFileContentQuery(skillId, relativePath);
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered');
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeout = useRef<NodeJS.Timeout | null>(null);

  const isMarkdown = relativePath.endsWith('.md');
  const isImage = data?.mimeType?.startsWith('image/') ?? false;
  const isSkillMd = relativePath === 'SKILL.md';
  const isText = data != null && !data.isBinary && data.content != null;

  const rawUrl = useMemo(
    () => `/api/skills/${skillId}/files/${encodeURIComponent(relativePath)}?raw=true`,
    [skillId, relativePath],
  );

  const parsed = useMemo(() => {
    if (!isMarkdown || !data?.content) {
      return null;
    }
    return parseFrontmatter(data.content);
  }, [isMarkdown, data?.content]);

  const handleCopy = useCallback(async () => {
    if (isCopied || !data?.content) {
      return;
    }
    try {
      await navigator.clipboard.writeText(data.content);
      setIsCopied(true);
      showToast({ message: localize('com_ui_copied_to_clipboard'), status: 'success' });
      if (copyTimeout.current) {
        clearTimeout(copyTimeout.current);
      }
      copyTimeout.current = setTimeout(() => setIsCopied(false), 2000);
    } catch {
      showToast({ message: localize('com_ui_copy_failed'), status: 'error' });
    }
  }, [data?.content, isCopied, showToast, localize]);

  return (
    <div className="flex h-full flex-col">
      {/* Header — fixed h-10 prevents layout shift when toggle appears/disappears */}
      <div className="flex h-10 items-center gap-2 border-b border-border-medium px-4">
        <button
          type="button"
          onClick={() => navigate(`/skills/${skillId}`)}
          className="rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label="Back to skill"
        >
          <ArrowLeft className="size-4" />
        </button>
        <FileText className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
          {data?.filename ?? relativePath}
        </span>

        {/* Actions — right side */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Copy (text files only) */}
          {isText && (
            <TooltipAnchor
              description={isCopied ? localize('com_ui_copied') : localize('com_ui_copy')}
              render={
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  aria-label={localize('com_ui_copy_to_clipboard')}
                >
                  {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
              }
            />
          )}

          {/* View toggle (markdown only) */}
          {isMarkdown && isText && (
            <div
              role="group"
              className="inline-flex h-7 rounded-lg bg-surface-tertiary p-0.5 text-sm font-medium"
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
                <Eye className="size-4" />
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
                <Code className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content — fills remaining space */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Spinner className="size-6 text-text-secondary" />
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
            {data.isBinary && isImage && (
              <img
                src={rawUrl}
                alt={data.filename}
                className="max-h-[600px] max-w-full rounded-lg object-contain"
              />
            )}

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

            {/* Markdown — frontmatter grid + rendered/source body */}
            {isText && isMarkdown && parsed && (
              <>
                {viewMode === 'rendered' && parsed.fields.length > 0 && (
                  <div className="mb-3 grid grid-cols-[max-content_1fr] items-baseline gap-x-8 gap-y-2">
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
                {viewMode === 'rendered' ? (
                  <SkillMarkdownRenderer content={parsed.body} />
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-primary">
                    {data.content}
                  </pre>
                )}
              </>
            )}

            {/* Non-markdown text */}
            {isText && !isMarkdown && (
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-primary">
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
