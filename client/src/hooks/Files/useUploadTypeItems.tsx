import { useCallback } from 'react';
import { useRecoilState } from 'recoil';
import {
  FileSearch,
  ImageUpIcon,
  FileType2Icon,
  FileImageIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import {
  Providers,
  EToolResources,
  EModelEndpoint,
  defaultAgentCapabilities,
  isDocumentSupportedProvider,
} from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import useAgentToolPermissions from '~/hooks/Agents/useAgentToolPermissions';
import useAgentCapabilities from '~/hooks/Agents/useAgentCapabilities';
import useGetAgentsConfig from '~/hooks/Agents/useGetAgentsConfig';
import useLocalize from '~/hooks/useLocalize';
import { ephemeralAgentByConvoId } from '~/store';

export type FileUploadType =
  | 'image'
  | 'document'
  | 'image_document'
  | 'image_document_extended'
  | 'image_document_video_audio';

interface UseUploadTypeItemsParams {
  agentId?: string | null;
  endpoint?: string | null;
  endpointType?: EModelEndpoint | string;
  useResponsesApi?: boolean;
  conversationId: string;
  /** Sets the tool resource used for the subsequent upload/attach action. */
  setToolResource: (value: EToolResources | undefined) => void;
}

/**
 * Builds the shared "upload type" menu items (image/document, OCR text, file
 * search, code environment) gated by agent capabilities and tool permissions.
 * Reused by the chat attach menu and the integrations sidebar pickers.
 */
export default function useUploadTypeItems({
  agentId,
  endpoint,
  endpointType,
  useResponsesApi,
  conversationId,
  setToolResource,
}: UseUploadTypeItemsParams) {
  const localize = useLocalize();
  const { agentsConfig } = useGetAgentsConfig();
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(
    ephemeralAgentByConvoId(conversationId),
  );
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);
  const { fileSearchAllowedByAgent, codeAllowedByAgent, provider } = useAgentToolPermissions(
    agentId,
    ephemeralAgent,
  );

  return useCallback(
    (onAction: (fileType?: FileUploadType) => void): MenuItemProps[] => {
      const items: MenuItemProps[] = [];

      let currentProvider = provider || endpoint;

      // This will be removed in a future PR to formally normalize Providers comparisons to be case insensitive
      if (currentProvider?.toLowerCase() === Providers.OPENROUTER) {
        currentProvider = Providers.OPENROUTER;
      }

      const isAzureWithResponsesApi =
        (currentProvider === EModelEndpoint.azureOpenAI ||
          endpointType === EModelEndpoint.azureOpenAI) &&
        useResponsesApi === true;

      if (
        isDocumentSupportedProvider(endpointType) ||
        isDocumentSupportedProvider(currentProvider) ||
        isAzureWithResponsesApi
      ) {
        items.push({
          label: localize('com_ui_upload_provider'),
          onClick: () => {
            setToolResource(undefined);
            let fileType: Exclude<FileUploadType, 'image' | 'document'> = 'image_document';
            if (currentProvider === Providers.GOOGLE || currentProvider === Providers.OPENROUTER) {
              fileType = 'image_document_video_audio';
            } else if (
              currentProvider === Providers.BEDROCK ||
              endpointType === EModelEndpoint.bedrock
            ) {
              fileType = 'image_document_extended';
            }
            onAction(fileType);
          },
          icon: <FileImageIcon className="icon-md" />,
        });
      } else {
        items.push({
          label: localize('com_ui_upload_image_input'),
          onClick: () => {
            setToolResource(undefined);
            onAction('image');
          },
          icon: <ImageUpIcon className="icon-md" />,
        });
      }

      if (capabilities.contextEnabled) {
        items.push({
          label: localize('com_ui_upload_ocr_text'),
          onClick: () => {
            setToolResource(EToolResources.context);
            onAction();
          },
          icon: <FileType2Icon className="icon-md" />,
        });
      }

      if (capabilities.fileSearchEnabled && fileSearchAllowedByAgent) {
        items.push({
          label: localize('com_ui_upload_file_search'),
          onClick: () => {
            setToolResource(EToolResources.file_search);
            setEphemeralAgent((prev) => ({
              ...prev,
              [EToolResources.file_search]: true,
            }));
            onAction();
          },
          icon: <FileSearch className="icon-md" />,
        });
      }

      if (capabilities.codeEnabled && codeAllowedByAgent) {
        items.push({
          label: localize('com_ui_upload_code_environment'),
          onClick: () => {
            setToolResource(EToolResources.execute_code);
            setEphemeralAgent((prev) => ({
              ...prev,
              [EToolResources.execute_code]: true,
            }));
            onAction();
          },
          icon: <TerminalSquareIcon className="icon-md" />,
        });
      }

      return items;
    },
    [
      localize,
      endpoint,
      provider,
      endpointType,
      capabilities,
      useResponsesApi,
      setToolResource,
      setEphemeralAgent,
      codeAllowedByAgent,
      fileSearchAllowedByAgent,
    ],
  );
}
