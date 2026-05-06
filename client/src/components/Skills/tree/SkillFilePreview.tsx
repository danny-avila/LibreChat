import { Download, FileImage, File } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import { useGetSkillNodeContentQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface SkillFilePreviewProps {
  skillId: string;
  nodeId: string;
  fileName: string;
}

export default function SkillFilePreview({ skillId, nodeId, fileName }: SkillFilePreviewProps) {
  const localize = useLocalize();
  const { data, isLoading } = useGetSkillNodeContentQuery(skillId, nodeId);

  const isImage = data?.mimeType?.startsWith('image/');
  const downloadUrl = (data as { downloadUrl?: string } | undefined)?.downloadUrl;
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-primary">
        <Spinner className="text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-primary">
      <div className="flex items-center gap-2 border-b border-border-light px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isImage ? (
            <FileImage className="size-4 shrink-0 text-pink-400" aria-hidden="true" />
          ) : (
            <File className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          )}
          <span className="truncate text-sm font-medium text-text-primary">{fileName}</span>
          {ext && (
            <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
              {ext}
            </span>
          )}
        </div>
        {downloadUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            asChild
          >
            <a
              href={downloadUrl}
              download={fileName}
              aria-label={`${localize('com_ui_download')} ${fileName}`}
            >
              <Download className="size-3" />
              {localize('com_ui_download')}
            </a>
          </Button>
        )}
      </div>
      <div
        className={cn(
          'flex flex-1 items-center justify-center overflow-auto p-8',
          isImage &&
            'bg-[repeating-conic-gradient(var(--surface-tertiary)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]',
        )}
      >
        {isImage && downloadUrl ? (
          <img
            src={downloadUrl}
            alt={fileName}
            className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-tertiary">
              <File className="size-7 text-text-tertiary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{fileName}</p>
              <p className="mt-0.5 text-xs text-text-tertiary">
                {data?.mimeType ?? localize('com_ui_unknown_file_type')}
              </p>
            </div>
            {downloadUrl && (
              <Button type="button" variant="outline" size="sm" className="mt-1 gap-1.5" asChild>
                <a href={downloadUrl} download={fileName}>
                  <Download className="size-3.5" />
                  {localize('com_ui_download')}
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
