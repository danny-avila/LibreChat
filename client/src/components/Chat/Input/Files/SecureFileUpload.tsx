import React, { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '~/utils/';
import { useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers/ToastContext';
import { useChatContext } from '~/Providers/ChatContext';
import { useSecureUploadMutation } from '~/data-provider';
import { insertTextAtCursor, forceResize } from '~/utils';

type SecureFileUploadProps = {
  className?: string;
  containerClassName?: string;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  onUploadComplete?: (downloadUrl: string) => void;
};

export interface SecureFileUploadRef {
  click: () => void;
}

const SecureFileUpload = forwardRef<SecureFileUploadRef, SecureFileUploadProps>(({
  className = '',
  containerClassName = '',
  textAreaRef,
  onUploadComplete,
}, ref) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { conversation } = useChatContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const secureUploadMutation = useSecureUploadMutation({
    onSuccess: (data) => {
      const downloadUrl = data.downloadUrl;
      
      // Insert the download link into the chat input
      if (textAreaRef.current && downloadUrl) {
        const linkText = `[${data.filename}](${downloadUrl})`;
        insertTextAtCursor(textAreaRef.current, linkText);
        forceResize(textAreaRef.current);
        
        // Focus the textarea
        textAreaRef.current.focus();
      }

      // Call the callback if provided
      onUploadComplete?.(downloadUrl);

      // Show success toast
      showToast({
        message: localize('com_files_secure_upload_success'),
        status: 'success',
      });
    },
    onError: (error: any) => {
      console.error('Secure upload error:', error);
      showToast({
        message: error?.message || localize('com_files_secure_upload_error'),
        status: 'error',
      });
    },
  });

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      // Create FormData for upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('endpoint', conversation?.endpoint || 'default');
      formData.append('conversationId', conversation?.conversationId || '');
      formData.append('ttlSeconds', '900'); // 15 minutes default
      formData.append('singleUse', 'true');

      // Start the upload
      secureUploadMutation.mutate(formData);

      // Reset the input
      event.target.value = '';
    },
    [conversation, secureUploadMutation],
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Expose the click method through ref
  useImperativeHandle(ref, () => ({
    click: handleClick,
  }), [handleClick]);

  const isUploading = secureUploadMutation.isLoading;

  return (
    <div className={cn('relative', containerClassName)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isUploading}
        className={cn(
          'mr-1 flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-normal transition-colors hover:bg-gray-100 hover:text-blue-600 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-blue-500',
          isUploading && 'opacity-50 cursor-not-allowed',
          className,
        )}
        title={localize('com_files_secure_upload_tooltip')}
      >
        <FileUp className={cn('mr-1 flex w-[22px] items-center stroke-1', isUploading && 'animate-pulse')} />
        <span className="flex text-xs">
          {isUploading ? localize('com_files_uploading') : localize('com_files_secure_upload')}
        </span>
      </button>
      
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="*/*"
        disabled={isUploading}
      />
    </div>
  );
});

SecureFileUpload.displayName = 'SecureFileUpload';

export default SecureFileUpload;
