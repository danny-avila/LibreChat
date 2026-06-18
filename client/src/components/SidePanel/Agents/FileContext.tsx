import { memo, useMemo, useRef, useState } from 'react';
import { Folder } from 'lucide-react';
import {
  HoverCard,
  AttachmentIcon,
  CircleHelpIcon,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
} from '@librechat/client';
import { EModelEndpoint, EToolResources } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useFileHandlingNoChatContext } from '~/hooks/Files/useFileHandling';
import { useAgentFileConfig, useLocalize, useLazyEffect } from '~/hooks';
import FileRow from '~/components/Chat/Input/Files/FileRow';
import { ESide, isEphemeralAgent } from '~/common';

function FileContext({
  agent_id,
  files: _files,
}: {
  agent_id: string;
  files?: [string, ExtendedFile][];
}) {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Map<string, ExtendedFile>>(new Map());
  const fileHandlingState = useMemo(() => ({ files, setFiles, conversation: null }), [files]);
  const { endpointFileConfig, providerValue, endpointType } = useAgentFileConfig();
  const endpointOverride = providerValue || EModelEndpoint.agents;

  const { handleFileChange } = useFileHandlingNoChatContext(
    {
      additionalMetadata: { agent_id, tool_resource: EToolResources.context },
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
  const isUploadDisabled = endpointFileConfig?.disabled ?? false;
  if (isUploadDisabled) {
    return null;
  }

  const handleLocalFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <HoverCard openDelay={50}>
        <div className="mb-2 flex items-center gap-2">
          <HoverCardTrigger asChild>
            <span className="flex items-center gap-2">
              <label className="text-token-text-primary block text-sm font-medium">
                {localize('com_agents_file_context_label')}
              </label>
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </span>
          </HoverCardTrigger>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  {localize('com_agents_file_context_description')}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </div>
      </HoverCard>
      <div className="flex flex-col gap-3">
        {/* File Context Files */}
        <FileRow
          files={files}
          setFiles={setFiles}
          agent_id={agent_id}
          tool_resource={EToolResources.context}
          Wrapper={({ children }) => <div className="flex flex-wrap gap-2">{children}</div>}
        />
        <div>
          <button
            type="button"
            disabled={isEphemeralAgent(agent_id)}
            className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg text-sm font-medium"
            onClick={handleLocalFileClick}
          >
            <div className="flex w-full items-center justify-center gap-1">
              <AttachmentIcon className="text-token-text-primary h-4 w-4" />
              <Folder className="icon-md" />
              {localize('com_ui_upload_file_context')}
            </div>
          </button>
          <input
            multiple={true}
            type="file"
            style={{ display: 'none' }}
            tabIndex={-1}
            ref={fileInputRef}
            disabled={isEphemeralAgent(agent_id)}
            onChange={handleFileChange}
          />
        </div>
        {/* Disabled Message */}
        {agent_id ? null : (
          <div className="text-xs text-text-secondary">
            {localize('com_agents_file_context_disabled')}
          </div>
        )}
      </div>
    </div>
  );
}

const MemoizedFileContext = memo(FileContext);
MemoizedFileContext.displayName = 'FileContext';

export default MemoizedFileContext;
