import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import {
  Tools,
  Constants,
  mergeFileConfig,
  getEndpointFileConfig,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { EToolResources } from 'librechat-data-provider';
import useAgentToolPermissions from '~/hooks/Agents/useAgentToolPermissions';
import useAgentCapabilities from '~/hooks/Agents/useAgentCapabilities';
import useGetAgentsConfig from '~/hooks/Agents/useGetAgentsConfig';
import { useGetFileConfig } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { getViableUploadOptions } from '~/utils';
import { useDragDropContext } from '~/Providers';
import { isEphemeralAgent } from '~/common';

/**
 * Resolves which upload destinations a file set can be routed to, plus whether uploads are
 * disabled for the endpoint. Shared by the paste, drag, and modal flows so they decide
 * consistently from one source.
 */
export default function useUploadOptions() {
  const { conversationId, agentId, endpoint, endpointType, useResponsesApi } = useDragDropContext();
  const { agentsConfig } = useGetAgentsConfig();
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);
  const ephemeralAgent = useRecoilValue(
    ephemeralAgentByConvoId(conversationId ?? Constants.NEW_CONVO),
  );
  const { provider, tools } = useAgentToolPermissions(agentId, ephemeralAgent);
  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  /**
   * Tools are offerable unless a saved agent omits them; in direct/ephemeral chats selecting
   * one enables the ephemeral capability, matching the original drag-and-drop behavior.
   */
  const isSavedAgent = agentId != null && agentId !== '' && !isEphemeralAgent(agentId);
  const fileSearchAllowedByAgent = !isSavedAgent || (tools?.includes(Tools.file_search) ?? false);
  const codeAllowedByAgent = !isSavedAgent || (tools?.includes(Tools.execute_code) ?? false);

  const endpointFileConfig = getEndpointFileConfig({ fileConfig, endpoint, endpointType });
  const uploadsDisabled = endpointFileConfig.disabled === true;
  const endpointSupportedMimeTypes = endpointFileConfig.supportedMimeTypes;

  const getOptions = useCallback(
    (files: File[]): (EToolResources | undefined)[] =>
      getViableUploadOptions(files, {
        provider,
        endpoint,
        endpointType,
        useResponsesApi,
        fileSearchEnabled: capabilities.fileSearchEnabled,
        codeEnabled: capabilities.codeEnabled,
        contextEnabled: capabilities.contextEnabled,
        fileSearchAllowedByAgent,
        codeAllowedByAgent,
        fileConfig,
        endpointSupportedMimeTypes,
      }),
    [
      provider,
      endpoint,
      endpointType,
      useResponsesApi,
      capabilities.fileSearchEnabled,
      capabilities.codeEnabled,
      capabilities.contextEnabled,
      fileSearchAllowedByAgent,
      codeAllowedByAgent,
      fileConfig,
      endpointSupportedMimeTypes,
    ],
  );

  return { getOptions, uploadsDisabled };
}
