import { memo, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useRecoilState, useResetRecoilState, useSetRecoilState } from 'recoil';
import type { Artifact } from '~/common';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { useAttachmentLink } from './LogLink';
import { useLocalize } from '~/hooks';
import { cn, getFileType } from '~/utils';
import store from '~/store';

interface ToolArtifactCardProps {
  attachment: Partial<TAttachment>;
  artifact: Artifact;
}

/**
 * Card that opens a code-execution-produced artifact in the side panel.
 * Mirrors `ArtifactButton` but registers the artifact directly in
 * `artifactsState` (no streaming-derived `visibleArtifacts` plumbing) and
 * pairs the open-panel action with a download button for the underlying
 * file — code-execution artifacts always have a real file behind them.
 */
const ToolArtifactCard = memo(({ attachment, artifact }: ToolArtifactCardProps) => {
  const localize = useLocalize();
  const setVisible = useSetRecoilState(store.artifactsVisibility);
  const [artifacts, setArtifacts] = useRecoilState(store.artifactsState);
  const [currentArtifactId, setCurrentArtifactId] = useRecoilState(store.currentArtifactId);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const isSelected = artifact.id === currentArtifactId;

  // Register the artifact on mount / when content changes. Idempotent on
  // shallow equality so re-renders don't churn state.
  useEffect(() => {
    setArtifacts((prev) => {
      const existing = prev?.[artifact.id];
      if (
        existing != null &&
        existing.content === artifact.content &&
        existing.type === artifact.type &&
        existing.title === artifact.title
      ) {
        return prev;
      }
      return { ...(prev ?? {}), [artifact.id]: artifact };
    });
  }, [artifact, setArtifacts]);

  const file = attachment as TFile & TAttachmentMetadata;
  const { handleDownload } = useAttachmentLink({
    href: attachment.filepath ?? '',
    filename: attachment.filename ?? '',
    file_id: file.file_id,
    user: file.user,
    source: file.source,
  });

  const handleOpen = () => {
    if (isSelected) {
      resetCurrentArtifactId();
      setVisible(false);
      return;
    }
    if (artifacts?.[artifact.id] == null) {
      setArtifacts((prev) => ({ ...(prev ?? {}), [artifact.id]: artifact }));
    }
    setCurrentArtifactId(artifact.id);
    setVisible(true);
  };

  const fileType = getFileType('artifact');
  const actionLabel = isSelected
    ? localize('com_ui_click_to_close')
    : localize('com_ui_artifact_click');

  return (
    <div className="group relative my-2 inline-flex max-w-fit items-stretch gap-px overflow-hidden rounded-xl text-sm text-text-primary shadow-sm">
      <button
        type="button"
        onClick={handleOpen}
        aria-pressed={isSelected}
        className={cn(
          'relative overflow-hidden rounded-l-xl transition-all duration-200 hover:bg-surface-hover active:scale-[0.99]',
          {
            'border-border-medium bg-surface-hover': isSelected,
            'border-border-light bg-surface-tertiary': !isSelected,
          },
        )}
      >
        <div className="w-fit p-2">
          <div className="flex flex-row items-center gap-2">
            <FilePreview fileType={fileType} className="relative" />
            <div className="overflow-hidden text-left">
              <div className="truncate font-medium" title={attachment.filename ?? ''}>
                {artifact.title}
              </div>
              <div className="truncate text-xs text-text-secondary">{actionLabel}</div>
            </div>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={handleDownload}
        aria-label={`${localize('com_ui_download')} ${attachment.filename ?? ''}`}
        title={localize('com_ui_download')}
        className={cn(
          'flex shrink-0 items-center justify-center px-3 transition-colors duration-200',
          'rounded-r-xl bg-surface-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary',
          'border-l border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
        )}
      >
        <Download className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
});

ToolArtifactCard.displayName = 'ToolArtifactCard';

export default ToolArtifactCard;
