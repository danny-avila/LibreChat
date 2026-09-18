import { useContext } from 'react';
import { useStore } from 'jotai';
import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { mediaAssetSchema } from 'librechat-data-provider';
import type { TMediaFileRef } from '~/common';
import { mediaDraftFamily } from '~/components/Media/state';
import { mediaSessionScope } from '~/routes/mediaHandoff';
import { AuthContext } from '~/hooks/AuthContext';
import { useFileMapContext } from '~/Providers';
import { useLocalize } from '~/hooks';

/** Existing authorized Files are reused by ID; opening the editor makes no provider call. The
 * host decides whether Studio is offered at all (see `Chat/Studio`); this only checks that the
 * file describes a usable asset, and touches the draft atom only when the reader acts. */
export default function OpenInStudio({ file }: { file: TMediaFileRef }) {
  const auth = useContext(AuthContext);
  const fileMap = useFileMapContext();
  const store = useStore();
  const localize = useLocalize();
  const navigate = useNavigate();
  const source = { ...(file.file_id ? fileMap?.[file.file_id] : undefined), ...file };
  const parsed = mediaAssetSchema.safeParse({
    file_id: source.file_id,
    filename: source.filename,
    filepath: source.filepath,
    type: source.type,
    bytes: source.bytes,
    width: source.width,
    height: source.height,
  });
  const user = auth?.user;
  if (!user || !parsed.success) return null;
  const asset = parsed.data;
  return (
    <Button
      variant="ghost"
      onClick={() => {
        store.set(mediaDraftFamily(`${mediaSessionScope(user)}:new`), (previous) => ({
          ...previous,
          revision: previous.revision + 1,
          operation: 'image.edit',
          parentTurnId: undefined,
          inputs: [{ role: 'reference', file_id: asset.file_id }],
          assets: [asset],
        }));
        navigate('/studio');
      }}
    >
      {localize('com_media_open_studio')}
    </Button>
  );
}
