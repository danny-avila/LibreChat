import { EModelEndpoint, supportsFiles } from 'librechat-data-provider';
import { AttachmentIcon } from '~/components/svg';
import { FileUpload } from '~/components/ui';
import { useFileHandling } from '~/hooks';

export default function AttachFile({
  endpoint,
  disabled = false,
}: {
  endpoint: EModelEndpoint | '';
  disabled?: boolean | null;
}) {
  const { handleFileChange } = useFileHandling();
  if (!supportsFiles[endpoint]) {
    return null;
  }

  return (
    <div className="absolute bottom-2 left-2 md:bottom-3 md:left-4">
      <FileUpload handleFileChange={handleFileChange} className="flex">
        <button
          disabled={!!disabled}
          type="button"
          className="btn relative p-0 text-black dark:text-white"
          aria-label="Attach files"
          style={{ padding: 0 }}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <AttachmentIcon />
          </div>
        </button>
      </FileUpload>
    </div>
  );
}
