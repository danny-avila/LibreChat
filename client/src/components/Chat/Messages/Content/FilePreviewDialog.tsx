import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import copy from 'copy-to-clipboard';
import { useRecoilValue } from 'recoil';
import { Download } from 'lucide-react';
import { FileSources } from 'librechat-data-provider';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogDescription } from '@librechat/client';
import CopyButton from '~/components/Messages/Content/CopyButton';
import { logger, sortPagesByRelevance, triggerDownload } from '~/utils';
import { useFileDownload, useFilePreview } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  fileId?: string;
  relevance?: number;
  pages?: number[];
  pageRelevance?: Record<number, number>;
  fileType?: string;
  fileSize?: number;
  source?: string | null;
}

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function canPreviewByMime(mime?: string): 'pdf' | 'text' | false {
  if (!mime) {
    return false;
  }
  if (mime.includes('pdf')) {
    return 'pdf';
  }
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('javascript') ||
    mime.includes('typescript') ||
    mime.includes('yaml') ||
    mime.includes('csv')
  ) {
    return 'text';
  }
  return false;
}

function canPreviewByExt(filename: string): 'pdf' | 'text' | false {
  const ext = getFileExtension(filename);
  if (ext === 'pdf') {
    return 'pdf';
  }
  const textExts = new Set([
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
  ]);
  return textExts.has(ext) ? 'text' : false;
}

/** Formats bytes with unit suffix (differs from ~/utils/formatBytes which returns a raw number). */
function formatBytes(bytes: number): string {
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function getMimeDisplayType(fileType?: string): string | undefined {
  if (!fileType) {
    return undefined;
  }
  if (fileType.includes('pdf')) {
    return 'PDF';
  }
  if (fileType.includes('word') || fileType.includes('document')) {
    return 'Document';
  }
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) {
    return 'Spreadsheet';
  }
  if (fileType.includes('presentation') || fileType.includes('powerpoint')) {
    return 'Presentation';
  }
  if (fileType.includes('image')) {
    return 'Image';
  }
  if (fileType.startsWith('text/')) {
    return fileType.split('/')[1]?.toUpperCase() || 'Text';
  }
  if (fileType.includes('json')) {
    return 'JSON';
  }
  if (fileType.includes('xml')) {
    return 'XML';
  }
  return undefined;
}

function getDisplayType(fileType?: string, fileName?: string): string {
  const mimeDisplayType = getMimeDisplayType(fileType);

  if (mimeDisplayType) {
    return mimeDisplayType;
  }

  const ext = fileName ? getFileExtension(fileName) : '';
  return ext ? ext.toUpperCase() : 'File';
}

function createTextDownloadUrl(text: string, fileType?: string): string {
  return URL.createObjectURL(new Blob([text], { type: fileType || 'text/plain' }));
}

export default function FilePreviewDialog({
  open,
  onOpenChange,
  fileName,
  fileId,
  relevance,
  pages,
  pageRelevance,
  fileType,
  fileSize,
  source,
}: FilePreviewDialogProps) {
  const localize = useLocalize();
  const user = useRecoilValue(store.user);
  const isTextSource = source === FileSources.text;
  const previewKind = isTextSource
    ? 'text'
    : canPreviewByMime(fileType) || canPreviewByExt(fileName);
  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', fileId, { direct: false });
  const { refetch: fetchTextPreview } = useFilePreview(isTextSource ? fileId : undefined, {
    enabled: false,
  });

  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileBlobUrl, setFileBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const loadingRef = useRef(false);

  const cancelledRef = useRef(false);

  const getTextSourceContent = useCallback(async () => {
    if (fileContent != null) {
      return fileContent;
    }
    const result = await fetchTextPreview();
    return result.data?.status === 'ready' ? result.data.text : undefined;
  }, [fetchTextPreview, fileContent]);

  const markPreviewUnavailable = useCallback(() => {
    if (cancelledRef.current) {
      return;
    }
    setPreviewError(true);
  }, []);

  const finishLoading = useCallback(() => {
    loadingRef.current = false;

    if (cancelledRef.current) {
      return;
    }
    setLoading(false);
  }, []);

  const loadTextSourcePreview = useCallback(async () => {
    const text = await getTextSourceContent();

    if (cancelledRef.current) {
      return;
    }
    if (text == null) {
      markPreviewUnavailable();
      return;
    }
    setFileContent(text);
  }, [getTextSourceContent, markPreviewUnavailable]);

  const loadStoredPreview = useCallback(async () => {
    const result = await downloadFile();

    if (cancelledRef.current) {
      return;
    }
    if (!result.data) {
      markPreviewUnavailable();
      return;
    }

    const resp = await fetch(result.data);
    const blob = await resp.blob();

    if (cancelledRef.current) {
      return;
    }
    if (previewKind === 'text') {
      setFileContent(await blob.text());
      return;
    }

    const typed = new Blob([blob], { type: 'application/pdf' });
    setFileBlobUrl(URL.createObjectURL(typed));
  }, [downloadFile, markPreviewUnavailable, previewKind]);

  const loadPreviewContent = useCallback(async () => {
    if (isTextSource) {
      await loadTextSourcePreview();
      return;
    }
    await loadStoredPreview();
  }, [isTextSource, loadStoredPreview, loadTextSourcePreview]);

  const loadPreview = useCallback(async () => {
    if (!fileId || !previewKind || loadingRef.current) {
      return;
    }
    loadingRef.current = true;
    cancelledRef.current = false;
    setLoading(true);
    setPreviewError(false);

    try {
      await loadPreviewContent();
    } catch {
      markPreviewUnavailable();
    } finally {
      finishLoading();
    }
  }, [fileId, finishLoading, loadPreviewContent, markPreviewUnavailable, previewKind]);

  const downloadTextSourceFile = useCallback(async () => {
    const text = await getTextSourceContent();

    if (text == null) {
      return;
    }
    triggerDownload(createTextDownloadUrl(text, fileType), fileName);
  }, [fileName, fileType, getTextSourceContent]);

  const downloadStoredFile = useCallback(async () => {
    const result = await downloadFile();

    if (!result.data) {
      return;
    }
    triggerDownload(result.data, fileName);
  }, [downloadFile, fileName]);

  const handleDownload = useCallback(async () => {
    if (!fileId) {
      return;
    }

    try {
      if (isTextSource) {
        await downloadTextSourceFile();
        return;
      }
      await downloadStoredFile();
    } catch (err) {
      logger.error('[FilePreviewDialog] Download failed:', err);
    }
  }, [downloadStoredFile, downloadTextSourceFile, fileId, isTextSource]);

  useEffect(() => {
    if (!open || !previewKind || fileContent || fileBlobUrl) {
      return;
    }
    loadPreview();
  }, [open, previewKind, fileContent, fileBlobUrl, loadPreview]);

  useEffect(() => {
    return () => {
      if (!fileBlobUrl) {
        return;
      }
      URL.revokeObjectURL(fileBlobUrl);
    };
  }, [fileBlobUrl]);

  useEffect(() => {
    if (open) {
      return;
    }
    cancelledRef.current = true;
    setFileContent(null);
    setFileBlobUrl(null);
    setPreviewError(false);
    setLoading(false);
    setIsCopied(false);
  }, [open]);

  const handleCopy = useCallback(() => {
    if (!fileContent) {
      return;
    }
    copy(fileContent, { format: 'text/plain' });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  }, [fileContent]);

  const displayType = useMemo(() => getDisplayType(fileType, fileName), [fileType, fileName]);
  const sortedPages = useMemo(
    () => (pages && pageRelevance ? sortPagesByRelevance(pages, pageRelevance) : pages),
    [pages, pageRelevance],
  );

  const metaParts: string[] = [displayType];
  if (relevance != null && relevance > 0) {
    metaParts.push(`${localize('com_ui_relevance')}: ${Math.round(relevance * 100)}%`);
  }
  if (fileSize != null && fileSize > 0) {
    metaParts.push(formatBytes(fileSize));
  }
  if (sortedPages && sortedPages.length > 0) {
    metaParts.push(localize('com_file_pages', { pages: sortedPages.join(', ') }));
  }

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent
        className="flex w-full max-w-4xl flex-col !overflow-hidden p-0"
        showCloseButton={true}
      >
        <div className="shrink-0 px-6 pr-12 pt-6">
          <OGDialogTitle className="truncate text-base">{fileName}</OGDialogTitle>
          <div className="mt-0.5 flex items-center gap-3">
            <OGDialogDescription className="min-w-0 truncate">
              {metaParts.join(' · ')}
            </OGDialogDescription>
            {fileId && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
                aria-label={`${localize('com_ui_download')} ${fileName}`}
              >
                <Download className="size-3" aria-hidden="true" />
                {localize('com_ui_download')}
              </button>
            )}
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
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
            <>
              <div className="pointer-events-none sticky top-0 z-10 flex justify-end pr-1">
                <CopyButton
                  isCopied={isCopied}
                  onClick={handleCopy}
                  iconOnly
                  label={localize('com_ui_copy')}
                  className="pointer-events-auto rounded-lg bg-surface-secondary"
                />
              </div>
              <div className="-mt-8 rounded-lg bg-surface-secondary p-4">
                <pre className="whitespace-pre-wrap break-words pr-8 font-mono text-sm leading-6 text-text-primary">
                  {fileContent}
                </pre>
              </div>
            </>
          )}
          {!previewKind && !loading && (
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
