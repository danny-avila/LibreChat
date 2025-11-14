import { useState, useEffect, useCallback } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useToastContext } from '@librechat/client';
import { useFormContext, useWatch } from 'react-hook-form';
import { mergeFileConfig, fileConfig as defaultFileConfig } from 'librechat-data-provider';
import type { AgentAvatar } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { AgentAvatarRender, NoImage, AvatarMenu } from './Images';
import { useGetFileConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { formatBytes } from '~/utils';

function Avatar({ avatar }: { avatar: AgentAvatar | null }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(1);
  const { control, setValue } = useFormContext<AgentForm>();
  const avatarPreview = useWatch({ control, name: 'avatar_preview' }) ?? '';
  const avatarAction = useWatch({ control, name: 'avatar_action' });
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  // Derive whether agent has a remote avatar from the avatar prop
  const hasRemoteAvatar = Boolean(avatar?.filepath);

  useEffect(() => {
    if (avatarAction) {
      return;
    }

    if (avatar?.filepath && avatarPreview !== avatar.filepath) {
      setValue('avatar_preview', avatar.filepath);
    }

    if (!avatar?.filepath && avatarPreview !== '') {
      setValue('avatar_preview', '');
    }
  }, [avatar?.filepath, avatarAction, avatarPreview, setValue]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      const sizeLimit = fileConfig.avatarSizeLimit ?? 0;

      if (!file) {
        setMenuOpen(false);
        return;
      }

      if (sizeLimit && file.size > sizeLimit) {
        const megabytes = formatBytes(sizeLimit);
        showToast({
          message: localize('com_ui_upload_invalid_var', { 0: megabytes + '' }),
          status: 'error',
        });
        setMenuOpen(false);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setValue('avatar_file', file, { shouldDirty: true });
        setValue('avatar_preview', (reader.result as string) ?? '', { shouldDirty: true });
        setValue('avatar_action', 'upload', { shouldDirty: true });
        setUploadProgress(1);
      };
      reader.readAsDataURL(file);
      setMenuOpen(false);
    },
    [fileConfig.avatarSizeLimit, localize, setValue, showToast],
  );

  const handleReset = useCallback(() => {
    setValue('avatar_preview', '', { shouldDirty: true });
    setValue('avatar_file', null, { shouldDirty: true });
    setValue('avatar_action', hasRemoteAvatar ? 'reset' : null, { shouldDirty: true });
    setUploadProgress(1);
    setMenuOpen(false);
  }, [hasRemoteAvatar, setValue]);

  const hasIcon = Boolean(avatarPreview) || hasRemoteAvatar;
  const canReset = hasIcon;

  return (
    <>
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <div className="flex w-full items-center justify-center gap-4">
          <Popover.Trigger asChild>
            <button
              type="button"
              className="f h-20 w-20 focus:rounded-full focus:ring-2 focus:ring-ring"
              aria-label={localize('com_ui_upload_agent_avatar_label')}
            >
              {avatarPreview ? (
                <AgentAvatarRender url={avatarPreview} progress={uploadProgress} />
              ) : (
                <NoImage />
              )}
            </button>
          </Popover.Trigger>
        </div>
        <AvatarMenu handleFileChange={handleFileChange} onReset={handleReset} canReset={canReset} />
      </Popover.Root>
    </>
  );
}

export default Avatar;
