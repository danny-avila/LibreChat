import { useState, useRef } from 'react';
import { Folder } from 'lucide-react';
import * as Ariakit from '@ariakit/react';
import {
  EModelEndpoint,
  EToolResources,
  mergeFileConfig,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import {
  HoverCard,
  DropdownPopup,
  AttachmentIcon,
  CircleHelpIcon,
  SharePointIcon,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
} from '@librechat/client';
import type { ExtendedFile } from '~/common';
import { useFileHandling, useLocalize, useLazyEffect, useSharePointFileHandling } from '~/hooks';
import { useGetFileConfig, useGetStartupConfig } from '~/data-provider';
import { SharePointPickerDialog } from '~/components/SharePoint';
import FileRow from '~/components/Chat/Input/Files/FileRow';
import { useChatContext } from '~/Providers';
import { ESide } from '~/common';

export default function FileContext({
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
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [isSharePointDialogOpen, setIsSharePointDialogOpen] = useState(false);
  const { data: startupConfig } = useGetStartupConfig();
  const sharePointEnabled = startupConfig?.sharePointFilePickerEnabled;

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const { handleFileChange } = useFileHandling({
    overrideEndpoint: EModelEndpoint.agents,
    additionalMetadata: { agent_id, tool_resource: EToolResources.ocr },
    fileSetter: setFiles,
  });
  const { handleSharePointFiles, isProcessing, downloadProgress } = useSharePointFileHandling({
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

  const endpointFileConfig = fileConfig.endpoints[EModelEndpoint.agents];
  const isUploadDisabled = endpointFileConfig.disabled ?? false;
  const handleSharePointFilesSelected = async (sharePointFiles: any[]) => {
    try {
      await handleSharePointFiles(sharePointFiles);
      setIsSharePointDialogOpen(false);
    } catch (error) {
      console.error('SharePoint file processing error:', error);
    }
  };
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
  const dropdownItems = [
    {
      label: localize('com_files_upload_local_machine'),
      onClick: handleLocalFileClick,
      icon: <Folder className="icon-md" />,
    },
    {
      label: localize('com_files_upload_sharepoint'),
      onClick: () => setIsSharePointDialogOpen(true),
      icon: <SharePointIcon className="icon-md" />,
    },
  ];
  const menuTrigger = (
    <Ariakit.MenuButton className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium">
      <div className="flex w-full items-center justify-center gap-1">
        <AttachmentIcon className="text-token-text-primary h-4 w-4" />
        {localize('com_ui_upload_file_context')}
      </div>
    </Ariakit.MenuButton>
  );
  return (
    <div className="w-full">
      <HoverCard openDelay={50}>
        <div className="mb-2 flex items-center gap-2">
          <HoverCardTrigger asChild>
            <span className="flex items-center gap-2">
              <label className="text-token-text-primary block font-medium">
                {localize('com_agents_file_context')}
              </label>
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </span>
          </HoverCardTrigger>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  {localize('com_agents_file_context_info')}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </div>
      </HoverCard>
      <div className="flex flex-col gap-3">
        {/* File Context (OCR) Files */}
        <FileRow
          files={files}
          setFiles={setFiles}
          setFilesLoading={setFilesLoading}
          agent_id={agent_id}
          tool_resource={EToolResources.ocr}
          Wrapper={({ children }) => <div className="flex flex-wrap gap-2">{children}</div>}
        />
        <div>
          {sharePointEnabled ? (
            <>
              <DropdownPopup
                gutter={2}
                menuId="file-search-upload-menu"
                isOpen={isPopoverActive}
                setIsOpen={setIsPopoverActive}
                trigger={menuTrigger}
                items={dropdownItems}
                modal={true}
                unmountOnHide={true}
              />
            </>
          ) : (
            <button
              type="button"
              disabled={!agent_id}
              className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
              onClick={handleLocalFileClick}
            >
              <div className="flex w-full items-center justify-center gap-1">
                <AttachmentIcon className="text-token-text-primary h-4 w-4" />

                {localize('com_ui_upload_file_context')}
              </div>
            </button>
          )}
          <input
            multiple={true}
            type="file"
            style={{ display: 'none' }}
            tabIndex={-1}
            ref={fileInputRef}
            disabled={!agent_id}
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
      <SharePointPickerDialog
        isOpen={isSharePointDialogOpen}
        onOpenChange={setIsSharePointDialogOpen}
        onFilesSelected={handleSharePointFilesSelected}
        isDownloading={isProcessing}
        downloadProgress={downloadProgress}
        maxSelectionCount={endpointFileConfig?.fileLimit}
      />
    </div>
  );
}
