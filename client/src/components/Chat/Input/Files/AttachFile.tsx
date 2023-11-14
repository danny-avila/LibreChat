import type { EModelEndpoint } from 'librechat-data-provider';
import { FileUpload } from '~/components/ui';
import { AttachmentIcon } from '~/components/svg';
import { useFileHandling } from '~/hooks';
import { supportsFiles } from '~/utils';
export default function AttachFile({ endpoint }: { endpoint: EModelEndpoint | '' }) {
  const { handleFileChange } = useFileHandling();
  if (!supportsFiles[endpoint]) {
    return null;
  }

  return (
    <>
      <div className="absolute bottom-1 left-1">
        <FileUpload handleFileChange={handleFileChange} className="flex">
          <button className="btn relative p-0 text-black dark:text-white" aria-label="Attach files">
            <div className="flex w-full items-center justify-center gap-2">
              <AttachmentIcon />
            </div>
          </button>
        </FileUpload>
      </div>
    </>
  );
}
