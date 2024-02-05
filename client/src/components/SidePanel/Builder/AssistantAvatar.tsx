import * as Popover from '@radix-ui/react-popover';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fileConfig, QueryKeys, defaultOrderQuery } from 'librechat-data-provider';
import type { Metadata, AssistantListResponse } from 'librechat-data-provider';
import { useUploadAssistantAvatarMutation } from '~/data-provider';
import { AssistantAvatar, NoImage, AvatarMenu } from './Images';
import { useToastContext } from '~/Providers';
// import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';
// import { cn } from '~/utils/';

function Avatar({ assistant_id, metadata }: { assistant_id: string; metadata: null | Metadata }) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState<number>(1);
  const [input, setinput] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const localize = useLocalize();
  const { showToast } = useToastContext();

  const { mutate: uploadAvatar } = useUploadAssistantAvatarMutation({
    onMutate: () => {
      setProgress(0.4);
    },
    onSuccess: (data) => {
      showToast({ message: localize('com_ui_upload_success') });
      const res = queryClient.getQueryData<AssistantListResponse>([
        QueryKeys.assistants,
        defaultOrderQuery,
      ]);

      if (!res?.data || !res) {
        return;
      }

      const assistants =
        res.data.map((assistant) => {
          if (assistant.id === assistant_id) {
            return {
              ...assistant,
              ...data,
            };
          }
          return assistant;
        }) ?? [];

      queryClient.setQueryData<AssistantListResponse>([QueryKeys.assistants, defaultOrderQuery], {
        ...res,
        data: assistants,
      });

      setProgress(1);
    },
    onError: (error) => {
      console.error('Error:', error);
      setPreviewUrl(null);
      showToast({ message: localize('com_ui_upload_error'), status: 'error' });
      setProgress(1);
    },
  });

  useEffect(() => {
    if (input) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(input);
    } else {
      setPreviewUrl(null);
    }
  }, [input]);

  useEffect(() => {
    if (metadata?.avatar) {
      setPreviewUrl(metadata.avatar as string);
    }
  }, [metadata?.avatar]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];

    if (file && file.size <= fileConfig.avatarSizeLimit) {
      if (!file) {
        console.error('No file selected');
        return;
      }

      setinput(file);

      const formData = new FormData();
      formData.append('file', file, file.name);
      formData.append('assistant_id', assistant_id);

      if (typeof metadata === 'object') {
        formData.append('metadata', JSON.stringify(metadata));
      }

      uploadAvatar({
        assistant_id,
        formData,
      });
    } else {
      showToast({
        message: localize('com_ui_upload_invalid'),
        status: 'error',
      });
    }

    setMenuOpen(false);
  };

  return (
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <div className="flex w-full items-center justify-center gap-4">
        <Popover.Trigger asChild>
          <button type="button" className="h-20 w-20">
            {previewUrl ? <AssistantAvatar url={previewUrl} progress={progress} /> : <NoImage />}
          </button>
        </Popover.Trigger>
      </div>
      {<AvatarMenu handleFileChange={handleFileChange} />}
    </Popover.Root>
  );
}

export default Avatar;
