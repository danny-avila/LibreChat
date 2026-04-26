import { memo, useState, useEffect } from 'react';
import { imageExtRegex, Tools } from 'librechat-data-provider';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import Image from '~/components/Chat/Messages/Content/Image';
import { useLocalize } from '~/hooks';
import { useAttachmentLink } from './LogLink';
import { cn } from '~/utils';

const COLLAPSED_MAX_HEIGHT = 320;
const COLLAPSE_THRESHOLD = 800;

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
  const [isVisible, setIsVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
  const canCollapse = text.length > COLLAPSE_THRESHOLD;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

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
          className="overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-6 text-text-primary"
          style={canCollapse && !expanded ? { maxHeight: COLLAPSED_MAX_HEIGHT } : undefined}
        >
          {text}
        </pre>
        {canCollapse && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
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

const isImageAttachment = (attachment: TAttachment): boolean => {
  if (!attachment.filename) {
    return false;
  }
  const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;
  return (
    imageExtRegex.test(attachment.filename) && width != null && height != null && filepath != null
  );
};

const isTextAttachment = (attachment: TAttachment): boolean => {
  const { text } = attachment as TFile & TAttachmentMetadata;
  return typeof text === 'string' && text.length > 0;
};

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

  attachments.forEach((attachment) => {
    if (attachment.type === Tools.web_search) {
      return;
    }
    if (isImageAttachment(attachment)) {
      imageAttachments.push(attachment);
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
              <FileAttachment attachment={attachment} key={`file-${index}`} />
            ) : null,
          )}
        </div>
      )}
      {textAttachments.length > 0 && (
        <div className="my-2 flex flex-col gap-3">
          {textAttachments.map((attachment, index) => (
            <TextAttachment attachment={attachment} key={`text-${index}`} />
          ))}
        </div>
      )}
      {imageAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center">
          {imageAttachments.map((attachment, index) => (
            <ImageAttachment attachment={attachment} key={`image-${index}`} />
          ))}
        </div>
      )}
    </>
  );
}
