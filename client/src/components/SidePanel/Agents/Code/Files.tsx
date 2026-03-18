import { memo, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { AttachmentIcon } from '@librechat/client';
import { EToolResources, EModelEndpoint, AgentCapabilities } from 'librechat-data-provider';
import type { ExtendedFile, AgentForm } from '~/common';
import { useFileHandlingNoChatContext } from '~/hooks/Files/useFileHandling';
import { useAgentFileConfig, useLocalize, useLazyEffect } from '~/hooks';
import FileRow from '~/components/Chat/Input/Files/FileRow';
import { isEphemeralAgent } from '~/common';

const tool_resource = EToolResources.execute_code;

function Files({
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
  const { abortUpload, handleFileChange } = useFileHandlingNoChatContext(
    {
      fileSetter: setFiles,
      additionalMetadata: { agent_id, tool_resource },
      endpointOverride,
      endpointTypeOverride: endpointType,
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

  const codeChecked = watch(AgentCapabilities.execute_code);
  const isUploadDisabled = endpointFileConfig?.disabled ?? false;

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
    <div className="mb-2 w-full">
      <div className="flex flex-col gap-3">
        <div className="rounded-lg text-xs text-text-secondary">
          {localize('com_assistants_code_interpreter_files')}
        </div>
        <FileRow
          files={files}
          setFiles={setFiles}
          agent_id={agent_id}
          abortUpload={abortUpload}
          tool_resource={tool_resource}
          Wrapper={({ children }) => <div className="flex flex-wrap gap-2">{children}</div>}
        />
        <div>
          <button
            type="button"
            disabled={isEphemeralAgent(agent_id) || codeChecked === false}
            className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
            onClick={handleButtonClick}
          >
            <div className="flex w-full items-center justify-center gap-1">
              <input
                multiple={true}
                type="file"
                style={{ display: 'none' }}
                tabIndex={-1}
                ref={fileInputRef}
                disabled={isEphemeralAgent(agent_id) || codeChecked === false}
                onChange={handleFileChange}
              />
              <AttachmentIcon className="text-token-text-primary h-4 w-4" />
              {localize('com_ui_upload_code_files')}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

const MemoizedFiles = memo(Files);
MemoizedFiles.displayName = 'Files';

export default MemoizedFiles;
