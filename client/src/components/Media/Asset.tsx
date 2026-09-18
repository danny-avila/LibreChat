import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiBaseUrl } from 'librechat-data-provider';
import {
  Download,
  Expand,
  ImageOff,
  MessageSquare,
  RotateCcw,
  WandSparkles,
  Image,
  AudioLines,
} from 'lucide-react';
import {
  Button,
  Skeleton,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
  TooltipAnchor,
} from '@librechat/client';
import type { MediaAsset } from 'librechat-data-provider';
import type { CSSProperties, ReactNode } from 'react';
import { MediaImagePixels, mediaImageFrame } from './ImagePending';
import { toAbsoluteFilePath } from '~/utils/media';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';

type PreviewProps = {
  asset: MediaAsset;
  compact?: boolean;
  expanded?: boolean;
  interactive?: boolean;
  onOpen?: () => void;
  imagePendingSince?: string;
};

export function MediaPreview(props: PreviewProps) {
  return <Preview key={`${props.asset.file_id}:${props.asset.filepath}`} {...props} />;
}

function Preview({
  asset,
  compact = false,
  expanded = false,
  interactive = !compact,
  onOpen,
  imagePendingSince,
}: PreviewProps) {
  const localize = useLocalize();
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const source = toAbsoluteFilePath(asset.filepath, apiBaseUrl());
  const video = asset.type.startsWith('video/');
  const audio = asset.type.startsWith('audio/');
  const fit = compact ? 'object-cover' : 'object-contain';
  const dimensions = expanded ? 'max-h-[75vh] w-auto max-w-full' : 'absolute inset-0 h-full w-full';
  const generatedImage = !!imagePendingSince && !video && !audio && !compact && !expanded;
  /** Chat sizes its images by their real proportions up to 512px; known originals match it. */
  const sizedImage =
    !video &&
    !audio &&
    !compact &&
    !expanded &&
    (generatedImage || (!!asset.width && !!asset.height));
  let frame = 'aspect-square max-h-[32rem] rounded-xl border border-border-light';
  let style: CSSProperties | undefined;
  if (video) frame = 'aspect-video rounded-xl border border-border-light';
  if (expanded) frame = 'min-h-40';
  if (compact) frame = 'aspect-square';
  if (audio && interactive) frame = 'min-h-20 rounded-xl px-2';
  if (sizedImage) {
    frame = 'rounded-xl border border-border-light';
    style = mediaImageFrame(asset);
  }
  let media: ReactNode;
  if (audio) {
    media = interactive ? (
      // Uploaded recordings have no supplied transcript track.
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio
        key={attempt}
        src={source}
        controls
        preload="metadata"
        aria-label={localize('com_media_audio_preview')}
        onLoadedMetadata={() => setStatus('ready')}
        onError={() => setStatus('failed')}
        className="w-full"
      />
    ) : (
      <AudioLines
        className="size-6 text-text-secondary"
        aria-label={localize('com_media_audio_preview')}
      />
    );
  } else if (video) {
    media = (
      // Generated originals have no caption track; never fabricate captions for provider output.
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        key={attempt}
        src={source}
        controls={interactive}
        preload="metadata"
        playsInline
        muted={!interactive}
        aria-label={localize('com_media_video_preview')}
        onLoadedData={() => setStatus('ready')}
        onLoadedMetadata={(event) => {
          setStatus('ready');
          if (compact && event.currentTarget.duration > 0) {
            event.currentTarget.currentTime = Math.min(0.1, event.currentTarget.duration / 2);
          }
        }}
        onError={() => setStatus('failed')}
        className={`${dimensions} ${fit}`}
      />
    );
  } else {
    media = (
      <img
        key={attempt}
        src={source}
        alt={localize('com_media_image_preview')}
        loading="eager"
        decoding="async"
        width={asset.width}
        height={asset.height}
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('failed')}
        className={`${dimensions} ${fit} ${generatedImage ? `transition-opacity duration-300 motion-reduce:transition-none ${status === 'ready' ? 'opacity-100' : 'opacity-0'}` : ''}`}
      />
    );
  }
  return (
    <span
      className={`relative grid w-full place-items-center overflow-hidden bg-surface-secondary ${frame}`}
      style={style}
    >
      {status !== 'failed' &&
        (onOpen && !video && !audio ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={localize('com_media_expand')}
            className="absolute inset-0 h-full w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {media}
          </button>
        ) : (
          media
        ))}
      {status === 'loading' && !(audio && !interactive) && (
        <span role="status" className="pointer-events-none absolute inset-0">
          {generatedImage ? (
            <span aria-hidden="true" className="block h-full w-full">
              <MediaImagePixels createdAt={imagePendingSince!} />
            </span>
          ) : (
            <Skeleton className="h-full w-full rounded-none motion-reduce:animate-none" />
          )}
          <span className="sr-only">{localize('com_media_preview_loading')}</span>
        </span>
      )}
      {status === 'failed' && (
        <span
          role="status"
          className="flex flex-col items-center gap-3 p-5 text-center text-sm text-text-secondary"
        >
          <ImageOff className="size-7" aria-hidden="true" />
          <span>
            {localize(compact ? 'com_media_preview_unavailable' : 'com_media_preview_failed')}
          </span>
          {!compact && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatus('loading');
                setAttempt((value) => value + 1);
              }}
            >
              <RotateCcw className="mr-2 size-4" aria-hidden="true" />
              {localize('com_media_retry_preview')}
            </Button>
          )}
        </span>
      )}
    </span>
  );
}

function formatBytes(bytes: number, locale: string) {
  let unit = 'byte';
  let divisor = 1;
  if (bytes >= 1000000) {
    unit = 'megabyte';
    divisor = 1000000;
  } else if (bytes >= 1000) {
    unit = 'kilobyte';
    divisor = 1000;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    maximumFractionDigits: 1,
  }).format(bytes / divisor);
}

export function MediaAssetView({
  asset,
  refine,
  cover,
  imagePendingSince,
}: {
  asset: MediaAsset;
  refine?: () => void;
  cover?: () => void;
  imagePendingSince?: string;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  let previewLabel:
    | 'com_media_image_preview'
    | 'com_media_video_preview'
    | 'com_media_audio_preview' = 'com_media_image_preview';
  if (asset.type.startsWith('video/')) previewLabel = 'com_media_video_preview';
  else if (asset.type.startsWith('audio/')) previewLabel = 'com_media_audio_preview';
  const openPreview = () => {
    if (document.activeElement instanceof HTMLButtonElement)
      trigger.current = document.activeElement;
    setOpen(true);
  };
  const source = toAbsoluteFilePath(asset.filepath, apiBaseUrl());
  const details = [
    asset.type.split('/')[1]?.toUpperCase(),
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : undefined,
    formatBytes(asset.bytes, i18n.language),
  ].filter((value): value is string => !!value);
  return (
    <figure className="min-w-0 space-y-2">
      <MediaPreview asset={asset} onOpen={openPreview} imagePendingSince={imagePendingSince} />
      <figcaption className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-secondary">
        {details.map((value, index) => (
          <span key={value} className="flex items-center gap-x-1.5">
            {index > 0 && <span aria-hidden="true">·</span>}
            {value}
          </span>
        ))}
      </figcaption>
      <div className="flex flex-wrap items-center gap-1.5">
        {refine && (
          <Button variant="outline" size="sm" disabled={!host.canCreate} onClick={refine}>
            <WandSparkles className="size-4" aria-hidden="true" />
            {localize('com_media_refine')}
          </Button>
        )}
        {host.useInChat && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(false);
              try {
                await host.useInChat?.(asset);
              } catch {
                if (host.isCurrentSession()) setError(true);
              } finally {
                if (host.isCurrentSession()) setBusy(false);
              }
            }}
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            {localize('com_media_use_chat')}
          </Button>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <TooltipAnchor
            description={localize('com_media_download')}
            render={
              <Button variant="ghost" size="icon-sm" asChild>
                <a
                  href={source}
                  download={asset.filename}
                  aria-label={localize('com_media_download')}
                >
                  <Download className="size-4" aria-hidden="true" />
                </a>
              </Button>
            }
          />
          <TooltipAnchor
            description={localize('com_media_expand')}
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={localize('com_media_expand')}
                onClick={openPreview}
              >
                <Expand className="size-4" aria-hidden="true" />
              </Button>
            }
          />
          {cover && (
            <TooltipAnchor
              description={localize('com_media_set_cover')}
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={localize('com_media_set_cover')}
                  onClick={cover}
                >
                  <Image className="size-4" aria-hidden="true" />
                </Button>
              }
            />
          )}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-text-secondary">
          {localize('com_media_chat_unsupported')}
        </p>
      )}
      <OGDialog open={open} onOpenChange={setOpen} triggerRef={trigger}>
        <OGDialogContent
          className="max-h-[95vh] max-w-6xl overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <OGDialogTitle>{localize(previewLabel)}</OGDialogTitle>
          <OGDialogDescription>{localize('com_media_preview_description')}</OGDialogDescription>
          <MediaPreview asset={asset} expanded />
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" asChild>
              <a href={source} download={asset.filename}>
                <Download className="size-4" aria-hidden="true" />
                {localize('com_media_download')}
              </a>
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </figure>
  );
}
