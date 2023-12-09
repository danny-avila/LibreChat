import React, { useState, useEffect } from 'react';
import { FileImage } from 'lucide-react';
import { useAuthContext } from '~/hooks';
import { cn } from '~/utils/';
import { useLocalize } from '~/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';

type StatusType = 'success' | 'invalid' | null;

function ProfilePictureUpload() {
  const [input, setinput] = useState<File | null>(null);
  const { user } = useAuthContext();
  const localize = useLocalize();
  const [statusColor, setStatusColor] = useState<string>('text-gray-600');
  const [status, setStatus] = useState<StatusType>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);

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

    if (file && file.size <= 2 * 1024 * 1024) {
      setinput(file);
      setStatus(null);
      setDialogOpen(true);
    } else {
      setStatus('invalid');
      setStatusColor('text-red-600');
    }
  };

  const handleUpload = async () => {
    try {
      const userId = user?.id;
      if (!userId) {
        throw new Error('User ID is undefined');
      }
      if (!input) {
        throw new Error('Nessun file selezionato');
      }
      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('input', input, input.name);
      const response = await fetch('/api/profilePicture', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error('Failed to upload profile picture');
      }
      const { url } = await response.json();

      setStatus('success');
      setStatusColor('text-green-500 dark:text-green-500');
      console.log('Profile picture uploaded successfully:', url);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setDialogOpen(false);
    }
  };

  const showUploadButton = input !== null;

  return (
    <>
      <div className="flex items-center justify-between">
        <span>{localize('com_nav_profile_picture')}</span>
        <label
          htmlFor={'file-upload-profile-picture'}
          className={cn(
            'flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-medium font-normal transition-colors hover:bg-slate-200 hover:text-green-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500',
            statusColor,
          )}
        >
          <FileImage className="mr-1 flex w-[22px] items-center stroke-1" />
          <span>
            {status === 'success'
              ? localize('com_ui_upload_success')
              : status === 'invalid'
                ? localize('com_ui_upload_invalid')
                : localize('com_nav_change_picture')}
          </span>
          <input
            id={'file-upload-profile-picture'}
            value=""
            type="file"
            className={cn('hidden')}
            accept=".png, .jpg"
            onChange={handleFileChange}
          />
        </label>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={() => setDialogOpen(false)}>
        <DialogContent
          className={cn('shadow-2xl dark:bg-gray-900 dark:text-white md:h-[350px] md:w-[450px]')}
          style={{ borderRadius: '12px' }}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-200">
              {localize('com_ui_preview')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className="mb-2 rounded-full"
                style={{
                  maxWidth: '100%',
                  maxHeight: '150px',
                  width: '150px',
                  height: '150px',
                  objectFit: 'cover',
                }}
              />
            )}
            {showUploadButton && (
              <button
                className="mt-4 rounded bg-green-500 px-4 py-2 text-white"
                onClick={handleUpload}
              >
                {localize('com_ui_upload')}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ProfilePictureUpload;
