import { memo, useEffect, useId, useLayoutEffect } from 'react';
import { Download } from 'lucide-react';
import { useRecoilState, useRecoilValue, useResetRecoilState, useSetRecoilState } from 'recoil';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import type { Artifact } from '~/common';
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
 * Three effects, separately scoped:
 *
 *  1. **Dedup claim** (`useLayoutEffect`, runs synchronously before
 *     paint). The same file can appear in multiple tool calls within a
 *     single message (e.g. the agent reads back what it just wrote) or
 *     across messages. Each card claims `toolArtifactClaim(artifact.id)`
 *     with its unique component-instance key on mount; the latest card
 *     to mount wins, so older duplicates re-render to `null`. The atom
 *     is family-keyed by artifact id, so claims for unrelated artifacts
 *     don't trigger re-renders here. Cleanup releases the claim if it's
 *     still ours so a subsequent re-mount can take it.
 *
 *  2. **Self-heal registration** subscribes to the per-id selector
 *     `artifactByIdSelector(artifact.id)` and writes only when the
 *     entry is missing or the cached content/type/title drifted. The
 *     panel's `useArtifacts` hook resets `artifactsState` on close, so
 *     this re-fires deterministically once the slice transitions back
 *     to `undefined` — without the no-deps render-loop pattern. The
 *     write is also gated on `isMyClaim`, making the registration
 *     single-writer per id: when two cards exist for the same file
 *     across turns, only the latest (claim-holder) updates state.
 *     Without that guard, both cards would observe each other's write
 *     and trade overwrites in a loop.
 *
 *  3. **Focus on mount** (deps: artifact.id). A freshly-mounted card
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
  const claimKey = useId();
  const setVisible = useSetRecoilState(store.artifactsVisibility);
  const setArtifacts = useSetRecoilState(store.artifactsState);
  const setCurrentArtifactId = useSetRecoilState(store.currentArtifactId);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const currentArtifactId = useRecoilValue(store.currentArtifactId);
  const existingEntry = useRecoilValue(store.artifactByIdSelector(artifact.id));
  const [claim, setClaim] = useRecoilState(store.toolArtifactClaim(artifact.id));
  const isSelected = artifact.id === currentArtifactId;
  const isMyClaim = claim === claimKey;

  useLayoutEffect(() => {
    // Always (re)claim on mount — a later card for the same id displaces
    // an earlier one, so the chip migrates to the most recent mention.
    setClaim(claimKey);
    return () => {
      // Only release when the claim is still ours; if a sibling already
      // took over we don't want to clobber its claim.
      setClaim((prev) => (prev === claimKey ? null : prev));
    };
  }, [claimKey, setClaim]);

  useEffect(() => {
    // Only the claim-winner writes. Two cards with the same `artifact.id`
    // but divergent content (same file_id reused across turns) would
    // otherwise see each other's write through `existingEntry`, detect
    // drift, and trade overwrites in a loop. Gating on `isMyClaim`
    // makes registration single-writer per id.
    if (!isMyClaim) {
      return;
    }
    if (
      existingEntry != null &&
      existingEntry.content === artifact.content &&
      existingEntry.type === artifact.type &&
      existingEntry.title === artifact.title
    ) {
      return;
    }
    setArtifacts((prev) => ({ ...(prev ?? {}), [artifact.id]: artifact }));
  }, [artifact, existingEntry, isMyClaim, setArtifacts]);

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

  // Another card with the same artifact id has the active claim — render
  // nothing here, that card is the canonical chip for this file.
  if (claim != null && !isMyClaim) {
    return null;
  }

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
