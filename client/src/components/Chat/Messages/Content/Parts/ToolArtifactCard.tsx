import { memo, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from 'recoil';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import type { Artifact } from '~/common';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import { displayFilename } from './attachmentTypes';
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
 *  3. **Focus + open on mount** (deps: artifact.id, artifact.type) —
 *     gated on `isSubmitting` captured at first render via a ref AND
 *     on `artifact.type !== CODE`. A card mounted *during* streaming
 *     for a rich-preview bucket (HTML, React, Markdown, plain text)
 *     steals panel focus and forces `artifactsVisibility = true` so
 *     the panel auto-opens — matching the legacy SSE auto-open UX.
 *     A card mounted while `isSubmitting === false` is part of
 *     conversation history (page load, back-navigation) and must not
 *     steal focus — `Presentation`'s render condition gates on
 *     `currentArtifactId != null`, so leaving both alone keeps the
 *     panel closed on history load. The CODE bucket (`.py`, `.js`,
 *     `Dockerfile`, …) is click-to-open *even on streaming*: source
 *     files are typically supporting scripts the agent emits alongside
 *     a richer deliverable, and shoving the panel in front of the
 *     user every time a helper script gets written is disruptive.
 *     Click-to-open via `handleOpen` works for every bucket regardless
 *     of context.
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
  /**
   * Captured at first render via a non-subscribing snapshot read so the
   * downstream effect doesn't re-fire (and the component doesn't
   * re-render) every time `isSubmittingFamily(0)` flips. Cards that mount
   * mid-stream stay "fresh" for the rest of their lifetime; cards that
   * mount post-stream stay "history" even if the user sends a new
   * message while this card stays mounted.
   */
  const readInitialIsSubmitting = useRecoilCallback(
    ({ snapshot }) =>
      () =>
        // `valueMaybe()` returns `undefined` if the atom is in an error
        // or loading state instead of throwing — defensive against an
        // upstream selector failure surfacing during card mount. The
        // `?? false` default is correct because a card we can't classify
        // as streaming is one we should treat as history (don't steal
        // focus / open the panel).
        snapshot.getLoadable(store.isSubmittingFamily(0)).valueMaybe() ?? false,
    [],
  );
  const mountedDuringStreamRef = useRef<boolean | null>(null);
  if (mountedDuringStreamRef.current === null) {
    mountedDuringStreamRef.current = readInitialIsSubmitting();
  }

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
    if (!mountedDuringStreamRef.current) {
      // Card mounted as part of conversation history — leave focus and
      // visibility alone so the side panel doesn't auto-open on navigation.
      return;
    }
    if (artifact.type === TOOL_ARTIFACT_TYPES.CODE) {
      // Source-code artifacts (`.py`, `.js`, `.cpp`, `Dockerfile`, …) are
      // click-to-open only. They're typically supporting scripts the
      // agent emits alongside a richer deliverable; auto-opening them
      // would shove the panel in front of the user every time a tool
      // call writes a helper file. The rich-preview buckets (HTML,
      // React, Markdown, plain text) keep the legacy auto-open UX so
      // an HTML deliverable still surfaces immediately.
      return;
    }
    // Streaming arrival: focus the new artifact AND force the panel
    // visible. Without `setVisible(true)`, a session where the user had
    // previously closed the panel (visibility=false) would surface the
    // selection in the chip ("click to close") but never actually open
    // — `Presentation` gates rendering on visibility.
    setCurrentArtifactId(artifact.id);
    setVisible(true);
  }, [artifact.id, artifact.type, setCurrentArtifactId, setVisible]);

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
  const visibleFilename = displayFilename(attachment.filename);
  // The artifact's stored `title` mirrors the on-disk `filename` for
  // tool artifacts, so re-derive the user-facing label rather than
  // showing the collision-suffixed name.
  const visibleTitle = displayFilename(artifact.title);

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
              <div className="truncate font-medium" title={visibleFilename}>
                {visibleTitle}
              </div>
              <div className="truncate text-xs text-text-secondary">{actionLabel}</div>
            </div>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={handleDownload}
        aria-label={`${localize('com_ui_download')} ${visibleFilename}`}
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
