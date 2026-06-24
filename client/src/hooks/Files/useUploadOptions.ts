import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { mergeFileConfig, defaultAgentCapabilities } from 'librechat-data-provider';
import type { EToolResources } from 'librechat-data-provider';
import useAgentToolPermissions from '~/hooks/Agents/useAgentToolPermissions';
import useAgentCapabilities from '~/hooks/Agents/useAgentCapabilities';
import useGetAgentsConfig from '~/hooks/Agents/useGetAgentsConfig';
import { useGetFileConfig } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { getViableUploadOptions } from '~/utils';
import { useDragDropContext } from '~/Providers';

/**
 * Returns a function that resolves which upload destinations a set of files can be routed
 * to, given the active endpoint and agent capabilities. Shared by the paste, drag, and
 * modal flows so they make the same decision from one source.
 */
export default function useUploadOptions() {
  const { conversationId, agentId, endpoint, endpointType, useResponsesApi } = useDragDropContext();
  const { agentsConfig } = useGetAgentsConfig();
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);
  const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(conversationId ?? ''));
  const { fileSearchAllowedByAgent, codeAllowedByAgent, provider } = useAgentToolPermissions(
    agentId,
    ephemeralAgent,
  );
  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  return useCallback(
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
    ],
  );
}
