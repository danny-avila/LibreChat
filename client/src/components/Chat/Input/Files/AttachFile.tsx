import {
  EModelEndpoint,
  supportsFiles,
  fileConfig as defaultFileConfig,
  mergeFileConfig,
} from 'librechat-data-provider';
import { useGetFileConfig } from '~/data-provider';
import { AttachmentIcon } from '~/components/svg';
import { FileUpload } from '~/components/ui';
import { useFileHandling } from '~/hooks';

export default function AttachFile({
  endpoint,
  endpointType,
  disabled = false,
}: {
  endpoint: EModelEndpoint | '';
  endpointType?: EModelEndpoint;
  disabled?: boolean | null;
}) {
  const { handleFileChange } = useFileHandling();
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const endpointFileConfig = fileConfig.endpoints[endpoint ?? ''];

  if (!supportsFiles[endpointType ?? endpoint ?? ''] || endpointFileConfig?.disabled) {
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
