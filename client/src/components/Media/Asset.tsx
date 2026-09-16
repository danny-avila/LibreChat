import { useState } from 'react';
import { Button } from '@librechat/client';
import { apiBaseUrl } from 'librechat-data-provider';
import type { MediaAsset } from 'librechat-data-provider';
import { toAbsoluteFilePath } from '~/utils/media';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';

export function MediaPreview({ asset, compact = false }: { asset: MediaAsset; compact?: boolean }) {
  const localize = useLocalize();
  const [failed, setFailed] = useState(false);
  const source = toAbsoluteFilePath(asset.filepath, apiBaseUrl());
  if (failed) return <p role="status">{localize('com_media_preview_failed')}</p>;
  if (asset.type.startsWith('video/'))
    return (
      // Generated originals have no caption track; never fabricate captions for provider output.
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={source}
        controls={!compact}
        preload="metadata"
        aria-label={asset.filename}
        onError={() => setFailed(true)}
        className="max-h-96 w-full rounded-lg object-contain"
      />
    );
  return (
    <img
      src={source}
      alt={asset.filename}
      loading="lazy"
      width={asset.width}
      height={asset.height}
      onError={() => setFailed(true)}
      className="max-h-96 w-full rounded-lg object-contain"
    />
  );
}
export function MediaAssetView({
  asset,
  refine,
  cover,
}: {
  asset: MediaAsset;
  refine?: () => void;
  cover?: () => void;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <figure className="space-y-2">
      <MediaPreview asset={asset} />
      <figcaption className="break-words text-sm text-text-secondary">{asset.filename}</figcaption>
      <div className="flex flex-wrap gap-2">
        <a
          className="rounded-lg px-3 py-2 text-sm underline focus-visible:outline"
          href={toAbsoluteFilePath(asset.filepath, apiBaseUrl())}
          download={asset.filename}
        >
          {localize('com_media_download')}
        </a>
        {refine && (
          <Button variant="outline" onClick={refine}>
            {localize('com_media_refine')}
          </Button>
        )}
        {cover && (
          <Button variant="ghost" onClick={cover}>
            {localize('com_media_set_cover')}
          </Button>
        )}
        {host.useInChat && (
          <Button
            variant="outline"
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
            {localize('com_media_use_chat')}
          </Button>
        )}
      </div>
      {error && <p role="alert">{localize('com_media_chat_unsupported')}</p>}
    </figure>
  );
}
