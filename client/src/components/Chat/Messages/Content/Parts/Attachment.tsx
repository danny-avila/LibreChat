import { memo, useState, useEffect } from 'react';
import { imageExtRegex, Tools, request } from 'librechat-data-provider';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import Image from '~/components/Chat/Messages/Content/Image';
import { useAttachmentLink } from './LogLink';
import { useToastContext } from '~/Providers';
import { cn } from '~/utils';

const FileAttachment = memo(({ attachment }: { attachment: Partial<TAttachment> }) => {
  const [isVisible, setIsVisible] = useState(false);
  const { showToast } = useToastContext();
  const { handleDownload: handleCodeOutputDownload } = useAttachmentLink({
    href: attachment.filepath ?? '',
    filename: attachment.filename ?? '',
  });

  /** Skill-generated / user-uploaded files have a file_id + user and live
   *  at /uploads/... — use the standard /api/files/download/:userId/:file_id
   *  endpoint with an authenticated blob fetch. Code-execution outputs (no
   *  file_id, virtual code-download path) keep using the existing hook. */
  const file = attachment as Partial<TFile>;
  const userId = (file as any).user as string | undefined;
  const file_id = file.file_id;
  const useStandardDownload =
    Boolean(file_id) && Boolean(userId) && (file.filepath?.startsWith('/uploads/') ?? false);

  const handleStandardDownload = async (
    event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>,
  ) => {
    event.preventDefault();
    try {
      const url = `/api/files/download/${encodeURIComponent(userId!)}/${encodeURIComponent(file_id!)}`;
      const res: any = await request.getResponse(url, {
        responseType: 'blob',
        withCredentials: true,
      } as any);
      const blob = res.data as Blob;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.setAttribute('download', attachment.filename ?? 'download');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
      showToast({ status: 'error', message: 'Error downloading file' });
    }
  };

  const handleDownload = useStandardDownload ? handleStandardDownload : handleCodeOutputDownload;

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
        altText={attachment.filename}
        imagePath={filepath ?? ''}
        height={height ?? 0}
        width={width ?? 0}
        className="mb-4"
      />
    </div>
  );
});

export default function Attachment({ attachment }: { attachment?: TAttachment }) {
  if (!attachment) {
    return null;
  }
  if (attachment.type === Tools.web_search) {
    return null;
  }

  const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;
  const isImage =
    imageExtRegex.test(attachment.filename) && width != null && height != null && filepath != null;

  if (isImage) {
    return <ImageAttachment attachment={attachment} />;
  } else if (!attachment.filepath) {
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

  attachments.forEach((attachment) => {
    const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;
    const isImage =
      imageExtRegex.test(attachment.filename) &&
      width != null &&
      height != null &&
      filepath != null;

    if (isImage) {
      imageAttachments.push(attachment);
    } else if (attachment.type !== Tools.web_search) {
      fileAttachments.push(attachment);
    }
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
