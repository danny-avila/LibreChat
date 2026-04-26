import { memo } from 'react';
import { Download } from 'lucide-react';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import Mermaid from '~/components/Messages/Content/Mermaid/Mermaid';
import { useAttachmentLink } from './LogLink';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ToolMermaidArtifactProps {
  attachment: TAttachment;
  text: string;
}

/**
 * Renders a code-execution-produced mermaid artifact inline. Skips the
 * sandpack/react path the side-panel artifacts use — the standalone
 * Mermaid component has its own zoom/expand/code-toggle UI and we want
 * to reuse it without bringing the bundler chrome along.
 */
const ToolMermaidArtifact = memo(({ attachment, text }: ToolMermaidArtifactProps) => {
  const localize = useLocalize();
  const file = attachment as TFile & TAttachmentMetadata;
  const { handleDownload } = useAttachmentLink({
    href: attachment.filepath ?? '',
    filename: attachment.filename ?? '',
    file_id: file.file_id,
    user: file.user,
    source: file.source,
  });

  return (
    <div className="my-2 flex w-full flex-col gap-1">
      {(attachment.filename || attachment.filepath) && (
        <div className="flex items-center justify-between gap-2">
          {attachment.filename && (
            <div
              className="truncate text-[10px] font-medium uppercase tracking-wide text-text-secondary"
              title={attachment.filename}
            >
              {attachment.filename}
            </div>
          )}
          {attachment.filepath && (
            <button
              type="button"
              onClick={handleDownload}
              aria-label={`${localize('com_ui_download')} ${attachment.filename ?? ''}`}
              title={localize('com_ui_download')}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs',
                'text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
              )}
            >
              <Download className="size-3" aria-hidden="true" />
              {localize('com_ui_download')}
            </button>
          )}
        </div>
      )}
      {/* `id` is optional on Mermaid; pass only when we have a real file_id
          so the component generates a unique render target on its own. */}
      {file.file_id ? <Mermaid id={file.file_id}>{text}</Mermaid> : <Mermaid>{text}</Mermaid>}
    </div>
  );
});

ToolMermaidArtifact.displayName = 'ToolMermaidArtifact';

export default ToolMermaidArtifact;
