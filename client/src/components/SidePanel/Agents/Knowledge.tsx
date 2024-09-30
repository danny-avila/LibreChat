import { useState, useRef, useEffect } from 'react';
import {
  EModelEndpoint,
  EToolResources,
  mergeFileConfig,
  retrievalMimeTypes,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { HoverCard, HoverCardPortal, HoverCardContent, HoverCardTrigger } from '~/components/ui';
import { CircleHelpIcon, AttachmentIcon } from '~/components/svg';
import FileRow from '~/components/Chat/Input/Files/FileRow';
import { useGetFileConfig } from '~/data-provider';
import { useFileHandling } from '~/hooks/Files';
import useLocalize from '~/hooks/useLocalize';
import { useChatContext } from '~/Providers';
import { ESide } from '~/common';

export default function Knowledge({
  agent_id,
  files: _files,
}: {
  agent_id: string;
  files?: [string, ExtendedFile][];
}) {
  const localize = useLocalize();
  const { setFilesLoading } = useChatContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Map<string, ExtendedFile>>(new Map());
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const { handleFileChange } = useFileHandling({
    overrideEndpoint: EModelEndpoint.agents,
    additionalMetadata: { agent_id, tool_resource: EToolResources.file_search },
    fileSetter: setFiles,
  });

  useEffect(() => {
    if (_files) {
      setFiles(new Map(_files));
    }
  }, [_files]);

  const endpointFileConfig = fileConfig.endpoints[EModelEndpoint.agents];
  const disabled = endpointFileConfig.disabled ?? false;

  if (disabled === true) {
    return null;
  }

  const handleButtonClick = () => {
    // necessary to reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  return (
    <div className="mb-6">
      <HoverCard openDelay={50}>
        <div className="mb-1.5 flex items-center gap-2">
          <span>
            <label className="text-token-text-primary block font-medium">
              {agent_id
                ? localize('com_assistants_knowledge')
                : localize('com_assistants_knowledge_disabled')}
            </label>
          </span>
          <HoverCardTrigger>
            <CircleHelpIcon className="h-5 w-5 text-gray-500" />
          </HoverCardTrigger>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  {localize('com_agents_knowledge_info')}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </div>
      </HoverCard>
      <div className="flex flex-col gap-4">
        <div>
          <button
            type="button"
            disabled={!agent_id}
            className="btn btn-neutral border-token-border-light relative h-8 rounded-lg font-medium"
            onClick={handleButtonClick}
          >
            <div className="flex w-full items-center justify-center gap-1">
              <AttachmentIcon className="text-token-text-primary h-4 w-4" />
              <input
                multiple={true}
                type="file"
                style={{ display: 'none' }}
                tabIndex={-1}
                ref={fileInputRef}
                disabled={!agent_id}
                onChange={handleFileChange}
              />
              {localize('com_ui_upload_files')}
            </div>
          </button>
        </div>
        {/* Knowledge Files */}
        <FileRow
          files={files}
          setFiles={setFiles}
          setFilesLoading={setFilesLoading}
          agent_id={agent_id}
          tool_resource={EToolResources.file_search}
          fileFilter={(file: ExtendedFile) =>
            retrievalMimeTypes.some((regex) => regex.test(file.type ?? ''))
          }
          Wrapper={({ children }) => <div className="flex flex-wrap gap-2">{children}</div>}
        />
      </div>
    </div>
  );
}
