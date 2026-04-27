import { memo, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useRecoilValue, useResetRecoilState, useSetRecoilState } from 'recoil';
import type { Artifact } from '~/common';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { useAttachmentLink } from './LogLink';
import { useLocalize } from '~/hooks';
import { cn, getFileType } from '~/utils';
import store from '~/store';

interface ToolArtifactCardProps {
  attachment: TAttachment;
  artifact: Artifact;
}

/**
 * Card that opens a code-execution-produced artifact in the side panel.
 *
 * Two effects, separately scoped:
 *
 *  1. **Self-heal registration** (no deps). The panel's `useArtifacts`
 *     hook resets `artifactsState` whenever the panel unmounts — including
 *     when the user closes it via visibility-toggle. Without re-registering
 *     on every render, an artifact disappears from state after a close and
 *     a subsequent click on the same card has nothing to open. The
 *     idempotent dedup makes this cheap.
 *
 *  2. **Focus on mount** (deps: artifact.id). A freshly-mounted card
 *     means a new artifact has arrived; we steal panel focus to match
 *     the legacy streaming-artifact UX where the latest artifact
 *     auto-opens. Cards that re-render with the same artifact don't
 *     refire this, so user clicks on older cards aren't overridden.
 *
 * Visibility is intentionally not toggled. The Recoil default is `true`,
 * which auto-opens the panel on first registration; a user who has
 * explicitly closed the panel keeps it closed until they click.
 */
const ToolArtifactCard = memo(({ attachment, artifact }: ToolArtifactCardProps) => {
  const localize = useLocalize();
  const setVisible = useSetRecoilState(store.artifactsVisibility);
  const setArtifacts = useSetRecoilState(store.artifactsState);
  const setCurrentArtifactId = useSetRecoilState(store.currentArtifactId);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const currentArtifactId = useRecoilValue(store.currentArtifactId);
  const isSelected = artifact.id === currentArtifactId;

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
  });

  useEffect(() => {
    setCurrentArtifactId(artifact.id);
  }, [artifact.id, setCurrentArtifactId]);

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
    // Registration already happened in the mount effect; the click only
    // needs to focus + reveal the panel for users who have closed it.
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
