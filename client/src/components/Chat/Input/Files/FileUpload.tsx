import React, { useState } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '~/utils/';
import { useLocalize } from '~/hooks';
import { useAuthContext } from '~/hooks';
import { useGetFileConfig } from '~/data-provider/Files/queries';

type FileUploadProps = {
  onFileSelected: (jsonData: Record<string, unknown>) => void;
  className?: string;
  containerClassName?: string;
  successText?: string;
  invalidText?: string;
  validator?: ((data: Record<string, unknown>) => boolean) | null;
  text?: string;
  id?: string;
};

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelected,
  className = '',
  containerClassName = '',
  successText = null,
  invalidText = null,
  validator = null,
  text = null,
  id = '1',
}) => {
  const [statusColor, setStatusColor] = useState<string>('text-gray-600');
  const [status, setStatus] = useState<null | string>(null);
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();  
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  const { data: fileConfig } = useGetFileConfig();

  const fileAttachRequiresSubscription = startupConfig?.fileAttachRequiresSubscription;
  const hasSubscription = user?.subscriptionStatus === 'active';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const jsonData = JSON.parse(e.target?.result as string);
      if (validator && !validator(jsonData)) {
        setStatus('invalid');
        setStatusColor('text-red-600');
        return;
      }

      if (validator) {
        setStatus('success');
        setStatusColor('text-green-500 dark:text-green-500');
      }

      onFileSelected(jsonData);
    };
    reader.readAsText(file);
  };

  let statusText: string;
  if (!status) {
    statusText = text ?? localize('com_ui_import');
  } else if (status === 'success') {
    statusText = successText ?? localize('com_ui_upload_success');
  } else {
    statusText = invalidText ?? localize('com_ui_upload_invalid');
  }

  const handleClick = () => {
    console.log('File upload clicked');
    console.log('File upload clicked', hasSubscription);
    console.log('File upload clicked', fileAttachRequiresSubscription);
    if (fileAttachRequiresSubscription && !hasSubscription) {
      setShowSubscriptionDialog(true);
      return;
    }
    const fileInput = document.getElementById(`file-upload-${id}`) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'mr-1 flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-normal transition-colors hover:bg-gray-100 hover:text-green-600 focus:ring-ring dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-green-500',
          statusColor,
          containerClassName,
        )}
        aria-label={statusText}
      >
        <FileUp className="mr-1 flex w-[22px] items-center stroke-1" aria-hidden="true" />
        <span className="flex text-xs">{statusText}</span>
      </button>
      <input
        id={`file-upload-${id}`}
        value=""
        type="file"
        className={cn('hidden', className)}
        accept=".json"
        onChange={handleFileChange}
        tabIndex={-1}
      />
      {showSubscriptionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white dark:bg-surface-primary rounded-lg p-6 shadow-xl flex flex-col gap-4 min-w-[300px]">
            <div className="text-lg font-semibold">Subscription Required</div>
            <div>You need an active subscription to upload files. Please subscribe to unlock this feature.</div>
            <div className="flex gap-4 justify-end mt-2">
              <button
                className="px-4 py-2 rounded bg-primary text-white font-medium hover:bg-primary-dark"
                onClick={() => setShowSubscriptionDialog(false)}
              >
                Close
              </button>
              <a
                href="/account/subscription"
                className="px-4 py-2 rounded bg-surface-secondary text-text-primary font-medium hover:bg-surface-tertiary border border-primary"
              >
                View Plans
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FileUpload;
