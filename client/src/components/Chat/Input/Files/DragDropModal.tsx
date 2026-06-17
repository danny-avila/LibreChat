import React, { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import {
  ImageUpIcon,
  FileSearch,
  FileType2Icon,
  FileImageIcon,
  TerminalSquareIcon,
  FileText,
  File as FileIcon,
} from 'lucide-react';
import {
  Providers,
  inferMimeType,
  EToolResources,
  EModelEndpoint,
  isBedrockDocumentType,
  defaultAgentCapabilities,
  isDocumentSupportedProvider,
} from 'librechat-data-provider';
import {
  useAgentToolPermissions,
  useAgentCapabilities,
  useGetAgentsConfig,
  useLocalize,
} from '~/hooks';
import { ephemeralAgentByConvoId } from '~/store';
import { useDragDropContext } from '~/Providers';
import { formatFileSize, getDragDropFileIcon } from './dragDropUi';

interface DragDropModalProps {
  onOptionSelect: (option: EToolResources | undefined) => void;
  files: File[];
  isVisible: boolean;
  setShowModal: (showModal: boolean) => void;
}

interface FileOption {
  label: string;
  value?: EToolResources;
  icon: React.JSX.Element;
  condition?: boolean;
}

const DragDropModal = ({ onOptionSelect, setShowModal, files, isVisible }: DragDropModalProps) => {
  const localize = useLocalize();
  const { agentsConfig } = useGetAgentsConfig();
  /** TODO: Ephemeral Agent Capabilities
   * Allow defining agent capabilities on a per-endpoint basis
   * Use definition for agents endpoint for ephemeral agents
   * */
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);
  const { conversationId, agentId, endpoint, endpointType, useResponsesApi } = useDragDropContext();
  const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(conversationId ?? ''));
  const { fileSearchAllowedByAgent, codeAllowedByAgent, provider } = useAgentToolPermissions(
    agentId,
    ephemeralAgent,
  );

  const options = useMemo(() => {
    const _options: FileOption[] = [];
    let currentProvider = provider || endpoint;

    // This will be removed in a future PR to formally normalize Providers comparisons to be case insensitive
    if (currentProvider?.toLowerCase() === Providers.OPENROUTER) {
      currentProvider = Providers.OPENROUTER;
    }

    /** Helper to get inferred MIME type for a file */
    const getFileType = (file: File) => inferMimeType(file.name, file.type);

    const isAzureWithResponsesApi =
      (currentProvider === EModelEndpoint.azureOpenAI ||
        endpointType === EModelEndpoint.azureOpenAI) &&
      useResponsesApi === true;

    // Check if provider supports document upload
    if (
      isDocumentSupportedProvider(endpointType) ||
      isDocumentSupportedProvider(currentProvider) ||
      isAzureWithResponsesApi
    ) {
      const supportsImageDocVideoAudio =
        currentProvider === EModelEndpoint.google || currentProvider === Providers.OPENROUTER;
      const isBedrock =
        currentProvider === Providers.BEDROCK || endpointType === EModelEndpoint.bedrock;

      const isValidProviderFile = (file: File): boolean => {
        const type = getFileType(file);
        if (supportsImageDocVideoAudio) {
          return (
            type?.startsWith('image/') ||
            type?.startsWith('video/') ||
            type?.startsWith('audio/') ||
            type === 'application/pdf'
          );
        }
        if (isBedrock) {
          return type?.startsWith('image/') || isBedrockDocumentType(type);
        }
        return type?.startsWith('image/') || type === 'application/pdf';
      };

      const validFileTypes = files.every(isValidProviderFile);

      _options.push({
        label: localize('com_ui_upload_provider'),
        value: undefined,
        icon: <FileImageIcon className="icon-md" />,
        condition: validFileTypes,
      });
    } else {
      // Only show image upload option if all files are images and provider doesn't support documents
      _options.push({
        label: localize('com_ui_upload_image_input'),
        value: undefined,
        icon: <ImageUpIcon className="icon-md" />,
        condition: files.every((file) => getFileType(file)?.startsWith('image/')),
      });
    }
    if (capabilities.fileSearchEnabled && fileSearchAllowedByAgent) {
      _options.push({
        label: localize('com_ui_upload_file_search'),
        value: EToolResources.file_search,
        icon: <FileSearch className="icon-md" />,
      });
    }
    if (capabilities.codeEnabled && codeAllowedByAgent) {
      _options.push({
        label: localize('com_ui_upload_code_environment'),
        value: EToolResources.execute_code,
        icon: <TerminalSquareIcon className="icon-md" />,
      });
    }
    if (capabilities.contextEnabled) {
      _options.push({
        label: localize('com_ui_upload_ocr_text'),
        value: EToolResources.context,
        icon: <FileType2Icon className="icon-md" />,
      });
    }

    return _options;
  }, [
    files,
    localize,
    provider,
    endpoint,
    endpointType,
    capabilities,
    useResponsesApi,
    codeAllowedByAgent,
    fileSearchAllowedByAgent,
  ]);

  if (!isVisible) {
    return null;
  }

  const fileIconFor = (file: File) => {
    const kind = getDragDropFileIcon(file.name, file.type);
    if (kind === 'image') return FileImageIcon;
    if (kind === 'document') return FileText;
    return FileIcon;
  };

  return (
    <OGDialog open={isVisible} onOpenChange={setShowModal}>
      <OGDialogTemplate
        title={localize('com_ui_upload_type')}
        className="w-11/12 sm:w-[440px] md:w-[400px] lg:w-[360px]"
        main={
          <div className="flex flex-col gap-3">
            {files.length > 0 && (
              <div className="rounded-lg border border-border-light bg-surface-secondary p-3">
                <p className="mb-2 text-xs font-medium text-text-secondary">
                  {localize(
                    files.length === 1
                      ? 'com_ui_drag_drop_file_count'
                      : 'com_ui_drag_drop_file_count_plural',
                    { count: files.length },
                  )}
                </p>
                <ul className="flex max-h-32 flex-col gap-1.5 overflow-y-auto">
                  {files.map((file) => {
                    const Icon = fileIconFor(file);
                    return (
                      <li
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="flex items-center gap-2 rounded-md bg-surface-primary px-2.5 py-2"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                          {file.name}
                        </span>
                        <span className="shrink-0 text-xs text-text-tertiary">
                          {formatFileSize(file.size)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-1">
              {options.map(
                (option, index) =>
                  option.condition !== false && (
                    <button
                      key={index}
                      type="button"
                      onClick={() => onOptionSelect(option.value)}
                      className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border-light hover:bg-surface-active-alt"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
                        {option.icon}
                      </span>
                      <span className="text-sm font-medium text-text-primary">{option.label}</span>
                    </button>
                  ),
              )}
            </div>
          </div>
        }
      />
    </OGDialog>
  );
};

export default DragDropModal;
