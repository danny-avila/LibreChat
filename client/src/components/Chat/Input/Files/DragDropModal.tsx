import React, { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import {
  Providers,
  inferMimeType,
  EToolResources,
  EModelEndpoint,
  defaultAgentCapabilities,
  isDocumentSupportedProvider,
} from 'librechat-data-provider';
import {
  ImageUpIcon,
  FileSearch,
  FileType2Icon,
  FileImageIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import {
  useAgentToolPermissions,
  useAgentCapabilities,
  useGetAgentsConfig,
  useLocalize,
} from '~/hooks';
import { ephemeralAgentByConvoId } from '~/store';
import { useDragDropContext } from '~/Providers';

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
      currentProvider === EModelEndpoint.azureOpenAI && useResponsesApi;

    // Check if provider supports document upload
    if (
      isDocumentSupportedProvider(endpointType) ||
      isDocumentSupportedProvider(currentProvider) ||
      isAzureWithResponsesApi
    ) {
      const supportsImageDocVideoAudio =
        currentProvider === EModelEndpoint.google || currentProvider === Providers.OPENROUTER;
      const validFileTypes = supportsImageDocVideoAudio
        ? files.every((file) => {
            const type = getFileType(file);
            return (
              type?.startsWith('image/') ||
              type?.startsWith('video/') ||
              type?.startsWith('audio/') ||
              type === 'application/pdf'
            );
          })
        : files.every((file) => {
            const type = getFileType(file);
            return type?.startsWith('image/') || type === 'application/pdf';
          });

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
        label: localize('com_ui_upload_code_files'),
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

  return (
    <OGDialog open={isVisible} onOpenChange={setShowModal}>
      <OGDialogTemplate
        title={localize('com_ui_upload_type')}
        className="w-11/12 sm:w-[440px] md:w-[400px] lg:w-[360px]"
        main={
          <div className="flex flex-col gap-2">
            {options.map(
              (option, index) =>
                option.condition !== false && (
                  <button
                    key={index}
                    onClick={() => onOptionSelect(option.value)}
                    className="flex items-center gap-2 rounded-lg p-2 hover:bg-surface-active-alt"
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </button>
                ),
            )}
          </div>
        }
      />
    </OGDialog>
  );
};

export default DragDropModal;
