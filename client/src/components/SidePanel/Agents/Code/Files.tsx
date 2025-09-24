import { useState, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { AttachmentIcon } from '@librechat/client';
import {
  EToolResources,
  EModelEndpoint,
  mergeFileConfig,
  AgentCapabilities,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import type { EndpointFileConfig } from 'librechat-data-provider';
import type { ExtendedFile, AgentForm } from '~/common';
import { useFileHandling, useLocalize, useLazyEffect } from '~/hooks';
import FileRow from '~/components/Chat/Input/Files/FileRow';
import { useGetFileConfig } from '~/data-provider';
import { useChatContext } from '~/Providers';
import { isEphemeralAgent } from '~/common';

const tool_resource = EToolResources.execute_code;

export default function Files({
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
  const { abortUpload, handleFileChange } = useFileHandling({
    fileSetter: setFiles,
    overrideEndpoint: EModelEndpoint.agents,
    additionalMetadata: { agent_id, tool_resource },
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

  const codeChecked = watch(AgentCapabilities.execute_code);

  const endpointFileConfig = fileConfig.endpoints[EModelEndpoint.agents] as
    | EndpointFileConfig
    | undefined;
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
          setFilesLoading={setFilesLoading}
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
