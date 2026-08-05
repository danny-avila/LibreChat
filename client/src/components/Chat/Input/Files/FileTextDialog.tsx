import React, { useState } from 'react';
import { Copy, CheckCheck } from 'lucide-react';
import {
  Button,
  Spinner,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  OGDialogDescription,
} from '@librechat/client';
import { useFilePreview } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface FileTextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  filename: string;
}

/**
 * Shows the text a document parser extracted from an upload.
 *
 * The file list strips `text` to keep payloads small, so the content is fetched
 * on demand and only while the dialog is open. Rendered verbatim in a monospace
 * block rather than as Markdown: the point is to show exactly what the model
 * receives, including the Markdown structure the parser produced.
 */
export default function FileTextDialog({
  open,
  onOpenChange,
  fileId,
  filename,
}: FileTextDialogProps) {
  const localize = useLocalize();
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError } = useFilePreview(fileId, { enabled: open });

  const text = data?.text ?? '';

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-3xl" showCloseButton={true}>
        <OGDialogHeader>
          <OGDialogTitle className="truncate">{filename}</OGDialogTitle>
          <OGDialogDescription>{localize('com_ui_extracted_text_description')}</OGDialogDescription>
        </OGDialogHeader>

        {isLoading && (
          <div className="flex h-40 items-center justify-center" role="status">
            <Spinner className="text-text-secondary" />
            <span className="sr-only">{localize('com_ui_loading')}</span>
          </div>
        )}

        {!isLoading && (isError || !text) && (
          <p className="py-8 text-center text-sm text-text-secondary">
            {localize('com_ui_extracted_text_none')}
          </p>
        )}

        {!isLoading && !isError && text && (
          <>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-tertiary p-4 text-sm text-text-primary">
              {text}
            </pre>
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={handleCopy} aria-label={localize('com_ui_copy')}>
                {copied ? <CheckCheck className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
                {localize('com_ui_copy')}
              </Button>
            </div>
          </>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}
