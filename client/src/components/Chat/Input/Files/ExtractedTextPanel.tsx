import React, { useState } from 'react';
import { Spinner } from '@librechat/client';
import CopyButton from '~/components/Messages/Content/CopyButton';
import { useFilePreview } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface ExtractedTextPanelProps {
  fileId?: string;
  /** Gates the request so the text is only fetched while it is on screen. */
  enabled: boolean;
}

/**
 * Renders the text a document parser extracted from an upload.
 *
 * Shown verbatim in a monospace block rather than rendered as Markdown: the point
 * is to see exactly what the model receives, structure included.
 */
export default function ExtractedTextPanel({ fileId, enabled }: ExtractedTextPanelProps) {
  const localize = useLocalize();
  const [isCopied, setIsCopied] = useState(false);
  const { data, isLoading, isError } = useFilePreview(fileId, { enabled: enabled && !!fileId });

  const text = data?.text ?? '';

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center" role="status">
        <Spinner className="text-text-secondary" />
        <span className="sr-only">{localize('com_ui_loading')}</span>
      </div>
    );
  }

  if (isError || !text) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">
        {localize('com_ui_extracted_text_none')}
      </p>
    );
  }

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10">
        <CopyButton
          isCopied={isCopied}
          onClick={handleCopy}
          iconOnly
          className="rounded-lg bg-surface-secondary"
        />
      </div>
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-tertiary p-4 pr-12 text-sm text-text-primary">
        {text}
      </pre>
    </div>
  );
}
