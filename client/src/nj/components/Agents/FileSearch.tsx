/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import React, { useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { AgentCapabilities, EModelEndpoint, EToolResources } from 'librechat-data-provider';
import type { AgentForm, ExtendedFile } from '~/common';
import FileSearchCheckbox from '~/components/SidePanel/Agents/FileSearchCheckbox';
import { useFileHandlingNoChatContext } from '~/hooks/Files/useFileHandling';
import { useAgentFileConfig, useLazyEffect, useLocalize } from '~/hooks';
import AddFilesButton from '~/nj/components/Agents/AddFilesButton';
import FileRow from '~/components/Chat/Input/Files/FileRow';

/**
 * New Jersey's customized FileSearch UI (based on LibreChat's `FileSearch.tsx`).
 *
 * I've taken care to simplify it, given that we don't have things like Sharepoint integration planned.
 */
export default function FileSearch({
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
      <hr className="mb-2 border-border-light" />

      {/* Header & explanation */}
      <div className="mx-3 mb-3">
        <h3 className="font-semibold">{localize('com_assistants_file_search')}</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Upload any documents you want the agent to search through — like policy documents,
          research papers, and other work files.
        </p>
        <FileSearchCheckbox />
      </div>

      {fileSearchChecked && (
        <div className="flex flex-col gap-3 px-3 pb-4">
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
                onClick={handleButtonClick}
                emptyMessage="PDFs, Word docs, or Spreadsheets up to 15MB per file"
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
            <div className="rounded border border-border-medium bg-surface-active-alt px-2 py-4 text-center text-sm text-text-secondary">
              {localize('com_agents_file_search_disabled')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
