import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { Download } from 'lucide-react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
  TooltipAnchor,
} from '@librechat/client';
import { useFileDownload } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  fileId?: string;
  relevance?: number;
  pages?: number[];
  fileType?: string;
  fileSize?: number;
}

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function isPdfFile(filename: string): boolean {
  return getFileExtension(filename) === 'pdf';
}

function isTextFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  return new Set([
    'txt',
    'md',
    'csv',
    'json',
    'xml',
    'yaml',
    'yml',
    'html',
    'css',
    'js',
    'ts',
    'jsx',
    'tsx',
    'py',
    'rb',
    'java',
    'c',
    'cpp',
    'h',
    'go',
    'rs',
    'sh',
    'sql',
    'log',
  ]).has(ext);
}

export default function FilePreviewDialog({
  open,
  onOpenChange,
  fileName,
  fileId,
  relevance,
  pages,
  fileType,
  fileSize,
}: FilePreviewDialogProps) {
  const localize = useLocalize();
  const user = useRecoilValue(store.user);
  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', fileId);

  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileBlobUrl, setFileBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const canPreview = fileId != null && (isPdfFile(fileName) || isTextFile(fileName));

  const loadPreview = useCallback(async () => {
    if (!fileId || loading) {
      return;
    }
    setLoading(true);
    setPreviewError(false);

    try {
      const result = await downloadFile();
      if (!result.data) {
        setPreviewError(true);
        return;
      }

      const resp = await fetch(result.data);
      const blob = await resp.blob();

      if (isTextFile(fileName)) {
        setFileContent(await blob.text());
      } else if (isPdfFile(fileName)) {
        const typed = new Blob([blob], { type: 'application/pdf' });
        setFileBlobUrl(URL.createObjectURL(typed));
      }
    } catch {
      setPreviewError(true);
    } finally {
      setLoading(false);
    }
  }, [fileId, fileName, downloadFile, loading]);

  const handleDownload = useCallback(async () => {
    if (!fileId) {
      return;
    }
    try {
      const result = await downloadFile();
      if (!result.data) {
        return;
      }
      const a = document.createElement('a');
      a.href = result.data;
      a.setAttribute('download', fileName);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(result.data);
    } catch {
      // silent
    }
  }, [downloadFile, fileId, fileName]);

  useEffect(() => {
    if (open && canPreview && !fileContent && !fileBlobUrl) {
      loadPreview();
    }
  }, [open, canPreview, fileContent, fileBlobUrl, loadPreview]);

  useEffect(() => {
    return () => {
      if (fileBlobUrl) {
        URL.revokeObjectURL(fileBlobUrl);
      }
    };
  }, [fileBlobUrl]);

  useEffect(() => {
    if (!open) {
      setFileContent(null);
      setFileBlobUrl(null);
      setPreviewError(false);
      setLoading(false);
    }
  }, [open]);

  const ext = useMemo(() => getFileExtension(fileName), [fileName]);
  const displayType = fileType || (ext ? ext.toUpperCase() : localize('com_ui_file'));

  const metaParts: string[] = [displayType];
  if (relevance != null && relevance > 0) {
    metaParts.push(`${localize('com_ui_relevance')}: ${Math.round(relevance * 100)}%`);
  }
  if (pages && pages.length > 0) {
    metaParts.push(localize('com_file_pages', { pages: pages.join(', ') }));
  }
  if (fileSize != null && fileSize > 0) {
    metaParts.push(
      fileSize >= 1048576
        ? `${(fileSize / 1048576).toFixed(1)} MB`
        : `${(fileSize / 1024).toFixed(1)} KB`,
    );
  }

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-full max-w-3xl p-0" showCloseButton={true}>
        <div className="px-6 pr-12 pt-6">
          <OGDialogTitle className="truncate text-base">{fileName}</OGDialogTitle>
          <div className="mt-0.5 flex items-center gap-3">
            <OGDialogDescription className="min-w-0 truncate">
              {metaParts.join(' · ')}
            </OGDialogDescription>
            {fileId && (
              <TooltipAnchor description={localize('com_ui_download')} side="right">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
                  aria-label={`${localize('com_ui_download')} ${fileName}`}
                >
                  <Download className="size-3" aria-hidden="true" />
                  {localize('com_ui_download')}
                </button>
              </TooltipAnchor>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-4">
          {loading && (
            <div className="flex h-60 items-center justify-center rounded-lg bg-surface-secondary">
              <span className="shimmer text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </span>
            </div>
          )}
          {previewError && (
            <div className="flex h-32 items-center justify-center rounded-lg bg-surface-secondary">
              <span className="text-sm text-text-secondary">
                {localize('com_ui_preview_unavailable')}
              </span>
            </div>
          )}
          {fileBlobUrl && (
            <iframe
              src={fileBlobUrl}
              title={`${localize('com_ui_preview')}: ${fileName}`}
              className="h-[70vh] w-full rounded-lg border border-border-light"
            />
          )}
          {fileContent && (
            <pre className="rounded-lg bg-surface-secondary p-4 font-mono text-sm leading-6 text-text-primary">
              {fileContent}
            </pre>
          )}
          {!canPreview && !loading && (
            <div className="flex h-32 items-center justify-center rounded-lg bg-surface-secondary">
              <span className="text-sm text-text-secondary">
                {localize('com_ui_preview_unavailable')}
              </span>
            </div>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
