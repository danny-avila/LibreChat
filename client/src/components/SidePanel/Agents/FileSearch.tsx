import { memo, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { AttachmentIcon } from '@librechat/client';
import { EModelEndpoint, EToolResources, AgentCapabilities } from 'librechat-data-provider';
import type { ExtendedFile, AgentForm } from '~/common';
import { useFileHandlingNoChatContext } from '~/hooks/Files/useFileHandling';
import { useAgentFileConfig, useLocalize, useLazyEffect } from '~/hooks';
import FileRow from '~/components/Chat/Input/Files/FileRow';
import FileSearchCheckbox from './FileSearchCheckbox';
import { isEphemeralAgent } from '~/common';

function FileSearch({
  agent_id,
  files: _files,
}: {
  agent_id: string;
  files?: [string, ExtendedFile][];
}) {
  const localize = useLocalize();
  const { watch } = useFormContext<AgentForm>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Map<string, ExtendedFile>>(new Map());
  const fileHandlingState = useMemo(() => ({ files, setFiles, conversation: null }), [files]);
  const { endpointFileConfig, providerValue, endpointType } = useAgentFileConfig();
  const endpointOverride = providerValue || EModelEndpoint.agents;

  const { handleFileChange } = useFileHandlingNoChatContext(
    {
      additionalMetadata: { agent_id, tool_resource: EToolResources.file_search },
      endpointOverride,
      endpointTypeOverride: endpointType,
      fileSetter: setFiles,
    },
    fileHandlingState,
  );

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
  const isUploadDisabled = endpointFileConfig?.disabled ?? false;
  const disabledUploadButton = isEphemeralAgent(agent_id) || fileSearchChecked === false;

  if (isUploadDisabled) {
    return null;
  }

  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-2">
        <span>
          <label className="text-token-text-primary block text-sm font-medium">
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
          agent_id={agent_id}
          tool_resource={EToolResources.file_search}
          Wrapper={({ children }) => <div className="flex flex-wrap gap-2">{children}</div>}
        />
        <div>
          <button
            type="button"
            disabled={disabledUploadButton}
            className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg text-sm font-medium"
            onClick={handleButtonClick}
          >
            <div className="flex w-full items-center justify-center gap-1">
              <AttachmentIcon className="text-token-text-primary h-4 w-4" />
              {localize('com_ui_upload_file_search')}
            </div>
          </button>
          <input
            multiple={true}
            type="file"
            style={{ display: 'none' }}
            tabIndex={-1}
            ref={fileInputRef}
            disabled={disabledUploadButton}
            onChange={handleFileChange}
          />
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

const MemoizedFileSearch = memo(FileSearch);
MemoizedFileSearch.displayName = 'FileSearch';

export default MemoizedFileSearch;
