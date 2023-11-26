import React, { useState } from 'react';
import { FileUp } from 'lucide-react';
import { useAuthContext } from '~/hooks';
import { cn } from '~/utils/';
import { useLocalize } from '~/hooks';

type StatusType = 'success' | 'invalid' | null;

function ProfilePictureUpload() {
  const [input, setinput] = useState<File | null>(null);
  const { user } = useAuthContext();
  const localize = useLocalize();
  const [statusColor, setStatusColor] = useState<string>('text-gray-600');
  const [status, setStatus] = useState<StatusType>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];

    if (file && file.size <= 2 * 1024 * 1024) {
      setinput(file);
      setStatus(null);
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

      // Annota il tipo di input
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
    }
  };

  const showUploadButton = input !== null;

  return (
    <div className="flex items-center space-x-2">
      <span className="text-xs">Profile Picture</span>
      <label
        htmlFor={'file-upload-profile-picture'}
        className={cn(
          'flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-medium font-normal transition-colors hover:bg-slate-200 hover:text-green-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500',
          statusColor,
        )}
      >
        <FileUp className="mr-1 flex w-[22px] items-center stroke-1" />
        <span className="flex text-xs ">
          {status === 'success'
            ? localize('com_ui_upload_success')
            : status === 'invalid'
              ? localize('com_ui_upload_invalid')
              : localize('com_endpoint_import')}
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
      {showUploadButton && (
        <button className="flex items-center text-xs" onClick={handleUpload}>
          Upload
        </button>
      )}
    </div>
  );
}

export default ProfilePictureUpload;
