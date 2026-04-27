import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Tools } from 'librechat-data-provider';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import { artifactTypeForAttachment, isImageAttachment, isTextAttachment } from './attachmentTypes';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import type { ToolArtifactType } from '~/utils/artifacts';
import { fileToArtifact, TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import Image from '~/components/Chat/Messages/Content/Image';
import ToolMermaidArtifact from './ToolMermaidArtifact';
import ToolArtifactCard from './ToolArtifactCard';
import { useAttachmentLink } from './LogLink';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const COLLAPSED_MAX_HEIGHT = 320;

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

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (!attachment.filepath) {
    return null;
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

const fileIdOf = (attachment: TAttachment, fallback: number): string =>
  (attachment as TFile & TAttachmentMetadata).file_id ?? `${fallback}`;

export default function Attachment({ attachment }: { attachment?: TAttachment }) {
  if (!attachment) {
    return null;
  }
  if (attachment.type === Tools.web_search) {
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
  const panelArtifacts: Array<{ attachment: TAttachment; type: ToolArtifactType }> = [];
  const mermaidArtifacts: TAttachment[] = [];

  attachments.forEach((attachment) => {
    if (attachment.type === Tools.web_search) {
      return;
    }
    if (isImageAttachment(attachment)) {
      imageAttachments.push(attachment);
      return;
    }
    const artType = artifactTypeForAttachment(attachment);
    if (artType === TOOL_ARTIFACT_TYPES.MERMAID) {
      mermaidArtifacts.push(attachment);
      return;
    }
    if (artType != null) {
      panelArtifacts.push({ attachment, type: artType });
      return;
    }
    if (isTextAttachment(attachment)) {
      textAttachments.push(attachment);
      return;
    }
    fileAttachments.push(attachment);
  });

  return (
    <>
      {fileAttachments.length > 0 && (
        <div className="my-2 flex flex-wrap items-center gap-2.5">
          {fileAttachments.map((attachment, index) =>
            attachment.filepath ? (
              <FileAttachment attachment={attachment} key={`file-${fileIdOf(attachment, index)}`} />
            ) : null,
          )}
        </div>
      )}
      {panelArtifacts.length > 0 && (
        <div className="my-2 flex flex-wrap items-center gap-2">
          {panelArtifacts.map(({ attachment, type }, index) => (
            <PanelArtifact
              attachment={attachment}
              type={type}
              key={`artifact-${fileIdOf(attachment, index)}`}
            />
          ))}
        </div>
      )}
      {mermaidArtifacts.length > 0 && (
        <div className="my-2 flex flex-col gap-3">
          {mermaidArtifacts.map((attachment, index) => (
            <MermaidArtifact
              attachment={attachment}
              key={`mermaid-${fileIdOf(attachment, index)}`}
            />
          ))}
        </div>
      )}
      {textAttachments.length > 0 && (
        <div className="my-2 flex flex-col gap-3">
          {textAttachments.map((attachment, index) => (
            <TextAttachment attachment={attachment} key={`text-${fileIdOf(attachment, index)}`} />
          ))}
        </div>
      )}
      {imageAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center">
          {imageAttachments.map((attachment, index) => (
            <ImageAttachment attachment={attachment} key={`image-${fileIdOf(attachment, index)}`} />
          ))}
        </div>
      )}
    </>
  );
}
