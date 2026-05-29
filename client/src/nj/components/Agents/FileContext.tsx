/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import React, { useMemo, useRef, useState } from 'react';
import { EModelEndpoint, EToolResources } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useFileHandlingNoChatContext } from '~/hooks/Files/useFileHandling';
import { useAgentFileConfig, useLazyEffect, useLocalize } from '~/hooks';
import FileRow from '~/components/Chat/Input/Files/FileRow';
import AddFilesButton from '~/nj/components/Agents/AddFilesButton';

/**
 * New Jersey's customized FileContext UI (based on LibreChat's `FileContext.tsx`).
 *
 * I've taken care to simplify it, given that we don't have things like Sharepoint integration planned.
 */
export default function FileContext({
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
    // necessary to reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <hr className="mb-2 border-border-heavy" />

      {/* Header & explanation */}
      <div className="mx-3 mb-3">
        <h3 className="text-sm font-semibold">{localize('com_agents_file_context_label')}</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Upload reference materials, examples, templates, or any other relevant instruction
          documents.
        </p>
      </div>

      <hr className="border-border-heavy" />

      <div className="flex flex-col gap-3 bg-surface-tertiary-alt px-3 pb-4 pt-4">
        {/* File Search (RAG API) Files */}
        <FileRow
          files={files}
          setFiles={setFiles}
          agent_id={agent_id}
          tool_resource={EToolResources.file_search}
          Wrapper={({ children }) => <div className="flex flex-wrap gap-2">{children}</div>}
        />

        {/* File upload button */}
        {agent_id && (
          <div>
            <AddFilesButton
              hasFiles={files.size !== 0}
              onClick={handleLocalFileClick}
              emptyMessage="Documents or code up to 15MB per file"
            />

            <input
              multiple={true}
              type="file"
              style={{ display: 'none' }}
              tabIndex={-1}
              ref={fileInputRef}
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* Disabled Message */}
        {!agent_id && (
          <div className="text-center text-sm text-text-secondary">
            {localize('com_agents_file_context_disabled')}
          </div>
        )}
      </div>
    </div>
  );
}
