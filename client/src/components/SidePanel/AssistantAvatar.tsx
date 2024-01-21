import { useState, useEffect, useRef } from 'react';
import { fileConfig } from 'librechat-data-provider';
import { useUploadAssistantAvatarMutation } from '~/data-provider';
import { AssistantAvatar, NoImage } from './Images';
import { useToastContext } from '~/Providers';
// import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';
// import { cn } from '~/utils/';

function Avatar({ assistant_id }: { assistant_id: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [input, setinput] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const localize = useLocalize();
  const { showToast } = useToastContext();

  const {
    // mutate: uploadAvatar,
    isLoading: isUploading,
  } = useUploadAssistantAvatarMutation({
    onSuccess: (data) => {
      console.dir(data, { depth: null });
      showToast({ message: localize('com_ui_upload_success') });
    },
    onError: (error) => {
      console.error('Error:', error);
      showToast({ message: localize('com_ui_upload_error'), status: 'error' });
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
      // uploadAvatar(formData);
    } else {
      showToast({
        message: localize('com_ui_upload_invalid'),
        status: 'error',
      });
    }
  };

  const handleButtonClick = () => {
    // necessary to reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  return (
    <div className="flex w-full items-center justify-center gap-4">
      <button type="button" className="h-20 w-20" onClick={handleButtonClick}>
        {previewUrl ? (
          <AssistantAvatar url={previewUrl} progress={isUploading ? 0.4 : 1} />
        ) : (
          <NoImage />
        )}
      </button>
      <input
        disabled={!!previewUrl}
        accept="image/png,.png,image/jpeg,.jpg,.jpeg,image/gif,.gif,image/webp,.webp"
        multiple={false}
        type="file"
        style={{ display: 'none' }}
        tabIndex={-1}
        onChange={handleFileChange}
        ref={fileInputRef}
      />
    </div>
  );
}

export default Avatar;
