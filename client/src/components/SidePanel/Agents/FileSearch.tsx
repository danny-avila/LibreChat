import { useState, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  EModelEndpoint,
  EToolResources,
  mergeFileConfig,
  AgentCapabilities,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import type { ExtendedFile, AgentForm } from '~/common';
import { useFileHandling, useLocalize, useLazyEffect } from '~/hooks';
import FileRow from '~/components/Chat/Input/Files/FileRow';
import FileSearchCheckbox from './FileSearchCheckbox';
import { useGetFileConfig } from '~/data-provider';
import { AttachmentIcon } from '~/components/svg';
import { useChatContext } from '~/Providers';

export default function FileSearch({
  agent_id,
  files: _files,
}: {
  agent_id: string;
  files?: [string, ExtendedFile][];
}) {
  const localize = useLocalize();
  const { setFilesLoading } = useChatContext();
  const { watch } = useFormContext<AgentForm>();
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

  useLazyEffect(
    () => {
      if (_files) {
        setFiles(new Map(_files));
      }
    },
    [_files],
    750,
  );

  const fileSearchChecked = watch(AgentCapabilities.file_search);

  const endpointFileConfig = fileConfig.endpoints[EModelEndpoint.agents];
  const isUploadDisabled = endpointFileConfig.disabled ?? false;

  if (isUploadDisabled) {
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
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-2">
        <span>
          <label className="text-token-text-primary block font-medium">
            {localize('com_assistants_file_search')}
          </label>
        </span>
      </div>
      <FileSearchCheckbox />
      <div className="flex flex-col gap-3">
        {/* File Search (RAG API) Files */}
        <FileRow
          files={files}
          setFiles={setFiles}
          setFilesLoading={setFilesLoading}
          agent_id={agent_id}
          tool_resource={EToolResources.file_search}
          Wrapper={({ children }) => <div className="flex flex-wrap gap-2">{children}</div>}
        />
        <div>
          <button
            type="button"
            disabled={!agent_id || fileSearchChecked === false}
            className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
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
                disabled={!agent_id || fileSearchChecked === false}
                onChange={handleFileChange}
              />
              {localize('com_ui_upload_file_search')}
            </div>
          </button>
        </div>
        {/* Disabled Message */}
        {agent_id ? null : (
          <div className="text-xs text-text-secondary">
            {localize('com_agents_file_search_disabled')}
          </div>
        )}
      </div>
    </div>
  );
}
