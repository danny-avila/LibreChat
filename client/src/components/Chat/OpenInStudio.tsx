import { useContext } from 'react';
import { useSetAtom } from 'jotai';
import { useRecoilValue } from 'recoil';
import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { Permissions, PermissionTypes, mediaAssetSchema } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import { useFileMapContext, useShareContext } from '~/Providers';
import { mediaDraftFamily } from '~/components/Media/state';
import { mediaSessionScope } from '~/routes/mediaHandoff';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { AuthContext } from '~/hooks/AuthContext';
import store from '~/store';

/** Existing authorized Files are reused by ID; opening the editor makes no provider call. */
export default function OpenInStudio({
  file,
}: {
  file: Partial<
    Pick<TFile, 'file_id' | 'filename' | 'filepath' | 'bytes' | 'type' | 'width' | 'height'>
  >;
}) {
  const auth = useContext(AuthContext);
  const { shareId } = useShareContext();
  const fileMap = useFileMapContext();
  const { data: startup } = useGetStartupConfig();
  const permitted = useHasAccess({
    permissionType: PermissionTypes.MEDIA,
    permission: Permissions.USE,
  });
  const temporary = useRecoilValue(store.isTemporary);
  const localize = useLocalize();
  const navigate = useNavigate();
  const setDraft = useSetAtom(
    mediaDraftFamily(`${auth?.user ? mediaSessionScope(auth.user) : ''}:new`),
  );
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
  if (
    !auth?.isAuthenticated ||
    !permitted ||
    !startup?.media?.studio ||
    shareId ||
    temporary ||
    !parsed.success
  )
    return null;
  const asset = parsed.data;
  return (
    <Button
      variant="ghost"
      onClick={() => {
        setDraft((previous) => ({
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
