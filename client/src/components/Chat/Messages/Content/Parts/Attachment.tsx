import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle, Download } from 'lucide-react';
import { Tools } from 'librechat-data-provider';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import type { ToolArtifactType } from '~/utils/artifacts';
import {
  artifactTypeForAttachment,
  bySalience,
  byEntrySalience,
  displayFilename,
  isImageAttachment,
  isInternalSandboxArtifact,
  isTextAttachment,
  renderAttachmentKey,
} from './attachmentTypes';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import { fileToArtifact, TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import Image from '~/components/Chat/Messages/Content/Image';
import ToolMermaidArtifact from './ToolMermaidArtifact';
import ToolArtifactCard from './ToolArtifactCard';
import { useAttachmentLink } from './LogLink';
import { useLocalize, useAttachmentPreviewSync } from '~/hooks';
import { cn, getFileType } from '~/utils';

const COLLAPSED_MAX_HEIGHT = 320;

/**
 * Card-shaped placeholder for a code-execution office file whose
 * inline preview is still rendering (or failed). Visually mirrors
 * `ToolArtifactCard`'s chrome — same rounded card, split body +
 * download — so when the deferred render lands and the routing
 * upgrades to the real `PanelArtifact` card the user sees a smooth
 * transition between two card-shaped things, not a jarring jump from
 * a small file chip to a big artifact card.
 *
 * The body is non-interactive while pending (there's no panel to
 * open yet). On `'failed'` the body is also non-interactive — the
 * download button is the only meaningful action since extraction
 * never produced anything to render. Status reads via the spinner /
 * alert subtitle inside the card, mirroring `ToolArtifactCard`'s
 * "click to open" subtitle slot.
 */
const PreviewPlaceholderCard = memo(
  ({
    attachment,
    status,
    previewError,
  }: {
    attachment: Partial<TAttachment>;
    status: 'pending' | 'failed';
    previewError?: string;
  }) => {
    const localize = useLocalize();
    const file = attachment as TFile & TAttachmentMetadata;
    const { handleDownload } = useAttachmentLink({
      href: attachment.filepath ?? '',
      filename: attachment.filename ?? '',
      file_id: file.file_id,
      user: file.user,
      source: file.source,
    });
    const fileType = getFileType('artifact');
    const visibleFilename = displayFilename(attachment.filename);
    const subtitleText =
      status === 'pending'
        ? localize('com_ui_preview_preparing')
        : localize('com_ui_preview_failed');
    return (
      <div className="group relative my-2 inline-flex max-w-fit items-stretch gap-px overflow-hidden rounded-xl text-sm text-text-primary shadow-sm">
        <div
          aria-disabled="true"
          aria-busy={status === 'pending'}
          className="relative overflow-hidden rounded-l-xl border-border-light bg-surface-tertiary"
          title={status === 'failed' ? (previewError ?? subtitleText) : undefined}
        >
          <div className="w-fit p-2">
            <div className="flex flex-row items-center gap-2">
              {/* Don't pass `file` here — it triggers `SourceIcon`'s
                  Terminal overlay for code-exec files (matches the
                  `metadata.fileIdentifier` marker), which is the
                  download-chip look. The artifact card doesn't show
                  that overlay; the placeholder shouldn't either, so
                  the pending→resolved transition is visually seamless. */}
              <FilePreview fileType={fileType} className="relative" />
              <div className="overflow-hidden text-left">
                <div className="truncate font-medium" title={visibleFilename}>
                  {visibleFilename}
                </div>
                <div className="flex items-center gap-1.5 truncate text-xs text-text-secondary">
                  {status === 'pending' ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">{subtitleText}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
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
  },
);
PreviewPlaceholderCard.displayName = 'PreviewPlaceholderCard';

const FileAttachment = memo(({ attachment }: { attachment: Partial<TAttachment> }) => {
  const [isVisible, setIsVisible] = useState(false);
  const file = attachment as TFile & TAttachmentMetadata;
  const { handleDownload } = useAttachmentLink({
    href: attachment.filepath ?? '',
    filename: attachment.filename ?? '',
    file_id: file.file_id,
    user: file.user,
    source: file.source,
  });
  const extension = attachment.filename?.split('.').pop();
  /* Bridge the deferred-preview lifecycle: poll the backend for the
   * resolved record while the file is still pending. The hook is a
   * no-op for terminal states (legacy records, ready, failed
   * already-known) so calling it unconditionally is cheap. */
  const { status: previewStatus, previewError } = useAttachmentPreviewSync(
    attachment as TAttachment,
  );

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (!attachment.filepath) {
    return null;
  }
  /* Pending or failed: render the card-shaped placeholder rather than
   * the small file chip. Visual continuity with `ToolArtifactCard` so
   * when the deferred render lands and the routing upgrades to
   * `PanelArtifact`, the user sees a smooth card→card transition
   * instead of a jump from "file download" to "artifact card". */
  if (previewStatus === 'pending' || previewStatus === 'failed') {
    return (
      <div
        className={cn(
          'file-attachment-container',
          'transition-all duration-300 ease-out',
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        )}
        style={{
          transformOrigin: 'center top',
          willChange: 'opacity, transform',
          WebkitFontSmoothing: 'subpixel-antialiased',
        }}
      >
        <PreviewPlaceholderCard
          attachment={attachment}
          status={previewStatus}
          previewError={previewError}
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'file-attachment-container',
        'transition-all duration-300 ease-out',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
      style={{
        transformOrigin: 'center top',
        willChange: 'opacity, transform',
        WebkitFontSmoothing: 'subpixel-antialiased',
      }}
    >
      <FileContainer
        file={attachment}
        onClick={handleDownload}
        overrideType={extension}
        displayName={displayFilename(attachment.filename)}
        containerClassName="max-w-fit"
        buttonClassName="bg-surface-secondary hover:cursor-pointer hover:bg-surface-hover active:bg-surface-secondary focus:bg-surface-hover hover:border-border-heavy active:border-border-heavy"
      />
    </div>
  );
});

const TextAttachment = memo(({ attachment }: { attachment: Partial<TAttachment> }) => {
  const localize = useLocalize();
  const preId = useId();
  const preRef = useRef<HTMLPreElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Decided once after layout: does the text actually overflow the collapsed
  // height? Char count is a poor proxy (a 100-char file with many newlines can
  // overflow; 800 chars of dense single-line text may not), so we measure.
  const [overflowed, setOverflowed] = useState(false);
  const file = attachment as TFile & TAttachmentMetadata;
  const { handleDownload } = useAttachmentLink({
    href: attachment.filepath ?? '',
    filename: attachment.filename ?? '',
    file_id: file.file_id,
    user: file.user,
    source: file.source,
  });
  const extension = attachment.filename?.split('.').pop();
  const text = file.text ?? '';

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    const el = preRef.current;
    if (!el) {
      return;
    }
    setOverflowed(el.scrollHeight > COLLAPSED_MAX_HEIGHT + 1);
  }, [text]);

  const isClamped = overflowed && !expanded;

  return (
    <div
      className={cn(
        'text-attachment-container flex w-full flex-col gap-1.5',
        'transition-all duration-300 ease-out',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
      style={{
        transformOrigin: 'center top',
        willChange: 'opacity, transform',
        WebkitFontSmoothing: 'subpixel-antialiased',
      }}
    >
      {attachment.filepath && (
        <FileContainer
          file={attachment}
          onClick={handleDownload}
          overrideType={extension}
          displayName={displayFilename(attachment.filename)}
          containerClassName="max-w-fit"
          buttonClassName="bg-surface-secondary hover:cursor-pointer hover:bg-surface-hover active:bg-surface-secondary focus:bg-surface-hover hover:border-border-heavy active:border-border-heavy"
        />
      )}
      <div className="rounded-lg bg-surface-secondary p-4">
        <pre
          id={preId}
          ref={preRef}
          className={cn(
            'whitespace-pre-wrap break-words font-mono text-sm leading-6 text-text-primary',
            isClamped ? 'overflow-hidden' : 'overflow-auto',
          )}
          style={isClamped ? { maxHeight: COLLAPSED_MAX_HEIGHT } : undefined}
        >
          {text}
        </pre>
        {overflowed && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls={preId}
            className="mt-2 text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
          >
            {expanded ? localize('com_ui_collapse') : localize('com_ui_show_all')}
          </button>
        )}
      </div>
    </div>
  );
});

const ImageAttachment = memo(({ attachment }: { attachment: TAttachment }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;

  useEffect(() => {
    setIsLoaded(false);
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, [attachment]);

  return (
    <div
      className={cn(
        'image-attachment-container',
        'transition-all duration-500 ease-out',
        isLoaded ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0',
      )}
      style={{
        transformOrigin: 'center top',
        willChange: 'opacity, transform',
        WebkitFontSmoothing: 'subpixel-antialiased',
      }}
    >
      <Image
        altText={attachment.filename || 'attachment image'}
        imagePath={filepath ?? ''}
        width={width}
        height={height}
        className="mb-4"
      />
    </div>
  );
});

interface PanelArtifactProps {
  attachment: TAttachment;
  /** Pre-classified type from the routing decision tree, threaded down so
   * `fileToArtifact` doesn't re-run `detectArtifactTypeFromFile`. */
  type: ToolArtifactType;
}

const PanelArtifact = memo(({ attachment, type }: PanelArtifactProps) => {
  const localize = useLocalize();
  const placeholder = localize('com_ui_artifact_preview_pending');
  const artifact = useMemo(
    () =>
      fileToArtifact(attachment as TFile & TAttachmentMetadata, {
        placeholder,
        preClassifiedType: type,
      }),
    [attachment, type, placeholder],
  );
  if (!artifact) {
    return null;
  }
  return <ToolArtifactCard attachment={attachment} artifact={artifact} />;
});
PanelArtifact.displayName = 'PanelArtifact';

const MermaidArtifact = memo(({ attachment }: { attachment: TAttachment }) => {
  const file = attachment as TFile & TAttachmentMetadata;
  if (!file.text) {
    return null;
  }
  return <ToolMermaidArtifact attachment={attachment} text={file.text} />;
});
MermaidArtifact.displayName = 'MermaidArtifact';

export default function Attachment({ attachment }: { attachment?: TAttachment }) {
  if (!attachment) {
    return null;
  }
  if (attachment.type === Tools.web_search) {
    return null;
  }
  // Sandbox-internal placeholders (`.dirkeep` etc.) are an implementation
  // detail of the bash executor's empty-folder preservation; users have
  // no reason to see them as their own file chips.
  if (isInternalSandboxArtifact(attachment)) {
    return null;
  }

  if (isImageAttachment(attachment)) {
    return <ImageAttachment attachment={attachment} />;
  }
  // Single classification call. The result is threaded into
  // `PanelArtifact` -> `fileToArtifact` so the panel path doesn't
  // re-run `detectArtifactTypeFromFile` a second time.
  const artType = artifactTypeForAttachment(attachment);
  if (artType === TOOL_ARTIFACT_TYPES.MERMAID) {
    return <MermaidArtifact attachment={attachment} />;
  }
  if (artType != null) {
    return <PanelArtifact attachment={attachment} type={artType} />;
  }
  if (isTextAttachment(attachment)) {
    return <TextAttachment attachment={attachment} />;
  }
  if (!attachment.filepath) {
    return null;
  }
  return <FileAttachment attachment={attachment} />;
}

export function AttachmentGroup({ attachments }: { attachments?: TAttachment[] }) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  const fileAttachments: TAttachment[] = [];
  const imageAttachments: TAttachment[] = [];
  const textAttachments: TAttachment[] = [];
  /* Pending-preview chips share this row with their future selves —
   * `type` is null while pending so the renderer falls back to
   * FileAttachment (PreviewPlaceholderCard); on resolution it switches
   * to PanelArtifact in place. */
  const panelRow: Array<{ attachment: TAttachment; type: ToolArtifactType | null }> = [];
  const mermaidArtifacts: TAttachment[] = [];

  attachments.forEach((attachment) => {
    if (attachment.type === Tools.web_search) {
      return;
    }
    if (isInternalSandboxArtifact(attachment)) {
      return;
    }
    if (isImageAttachment(attachment)) {
      imageAttachments.push(attachment);
      return;
    }
    if ((attachment as Partial<TFile>).status === 'pending') {
      panelRow.push({ attachment, type: null });
      return;
    }
    const artType = artifactTypeForAttachment(attachment);
    if (artType === TOOL_ARTIFACT_TYPES.MERMAID) {
      mermaidArtifacts.push(attachment);
      return;
    }
    if (artType != null) {
      panelRow.push({ attachment, type: artType });
      return;
    }
    if (isTextAttachment(attachment)) {
      textAttachments.push(attachment);
      return;
    }
    fileAttachments.push(attachment);
  });

  // Sink empty / placeholder-shaped files in each bucket so the user's
  // eye lands on the real artifact first. `sort` is stable in modern
  // engines (V8 ≥ 7.0) so equal-weight entries keep their input order.
  fileAttachments.sort(bySalience);
  textAttachments.sort(bySalience);
  /* Sort only the typed (resolved) entries; pending placeholders bubble
   * to the end of the row so resolved siblings catch the eye first. */
  const resolvedPanel = panelRow.filter(
    (e): e is { attachment: TAttachment; type: ToolArtifactType } => e.type != null,
  );
  const pendingPanel = panelRow.filter((e) => e.type == null);
  resolvedPanel.sort(byEntrySalience);
  mermaidArtifacts.sort(bySalience);
  imageAttachments.sort(bySalience);

  return (
    <>
      {fileAttachments.length > 0 && (
        <div className="my-2 flex flex-wrap items-center gap-2.5">
          {fileAttachments.map((attachment, index) =>
            attachment.filepath ? (
              <FileAttachment
                attachment={attachment}
                key={renderAttachmentKey('file', attachment, index)}
              />
            ) : null,
          )}
        </div>
      )}
      {(resolvedPanel.length > 0 || pendingPanel.length > 0) && (
        <div className="my-2 flex flex-wrap items-center gap-2">
          {resolvedPanel.map(({ attachment, type }, index) => (
            <PanelArtifact
              attachment={attachment}
              type={type}
              key={renderAttachmentKey('artifact', attachment, index)}
            />
          ))}
          {pendingPanel.map(({ attachment }, index) =>
            attachment.filepath ? (
              <FileAttachment
                attachment={attachment}
                key={renderAttachmentKey('pending', attachment, index)}
              />
            ) : null,
          )}
        </div>
      )}
      {mermaidArtifacts.length > 0 && (
        <div className="my-2 flex flex-col gap-3">
          {mermaidArtifacts.map((attachment, index) => (
            <MermaidArtifact
              attachment={attachment}
              key={renderAttachmentKey('mermaid', attachment, index)}
            />
          ))}
        </div>
      )}
      {textAttachments.length > 0 && (
        <div className="my-2 flex flex-col gap-3">
          {textAttachments.map((attachment, index) => (
            <TextAttachment
              attachment={attachment}
              key={renderAttachmentKey('text', attachment, index)}
            />
          ))}
        </div>
      )}
      {imageAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center">
          {imageAttachments.map((attachment, index) => (
            <ImageAttachment
              attachment={attachment}
              key={renderAttachmentKey('image', attachment, index)}
            />
          ))}
        </div>
      )}
    </>
  );
}
