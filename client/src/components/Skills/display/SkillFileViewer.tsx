import { memo, useMemo } from 'react';
import { ArrowLeft, FileText, FileQuestion } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@librechat/client';
import { endpoints } from 'librechat-data-provider';
import { useGetSkillFileContentQuery } from '~/data-provider';
import SkillMarkdownRenderer from './SkillMarkdownRenderer';
import { useLocalize } from '~/hooks';

interface SkillFileViewerProps {
  skillId: string;
  relativePath: string;
}

function SkillFileViewer({ skillId, relativePath }: SkillFileViewerProps) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { data, isLoading, isError } = useGetSkillFileContentQuery(skillId, relativePath);

  const isMarkdown = relativePath.endsWith('.md');
  const isImage = data?.mimeType?.startsWith('image/') ?? false;

  const rawUrl = useMemo(
    () => `${endpoints.skillFile(skillId, relativePath)}?raw=true`,
    [skillId, relativePath],
  );

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
      <div className="flex-1 overflow-y-auto p-4">
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

            {!data.isBinary && data.content != null && isMarkdown && (
              <SkillMarkdownRenderer content={data.content} />
            )}

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
