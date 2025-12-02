import { memo, useMemo } from 'react';
import {
  Constants,
  supportsFiles,
  EModelEndpoint,
  mergeFileConfig,
  isAgentsEndpoint,
  getEndpointField,
  isAssistantsEndpoint,
  getEndpointFileConfig,
} from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useGetFileConfig, useGetEndpointsQuery } from '~/data-provider';
import AttachFileMenu from './AttachFileMenu';
import AttachFile from './AttachFile';

function AttachFileChat({
  disableInputs,
  conversation,
}: {
  disableInputs: boolean;
  conversation: TConversation | null;
}) {
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;
  const { endpoint } = conversation ?? { endpoint: null };
  const isAgents = useMemo(() => isAgentsEndpoint(endpoint), [endpoint]);
  const isAssistants = useMemo(() => isAssistantsEndpoint(endpoint), [endpoint]);

  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const { data: endpointsConfig } = useGetEndpointsQuery();

  const endpointType = useMemo(() => {
    return (
      getEndpointField(endpointsConfig, endpoint, 'type') ||
      (endpoint as EModelEndpoint | undefined)
    );
  }, [endpoint, endpointsConfig]);

  const endpointFileConfig = useMemo(
    () =>
      getEndpointFileConfig({
        endpoint,
        fileConfig,
        endpointType,
      }),
    [endpoint, fileConfig, endpointType],
  );
  const endpointSupportsFiles: boolean = useMemo(
    () => supportsFiles[endpointType ?? endpoint ?? ''] ?? false,
    [endpointType, endpoint],
  );
  const isUploadDisabled = useMemo(
    () => (disableInputs || endpointFileConfig?.disabled) ?? false,
    [disableInputs, endpointFileConfig?.disabled],
  );

  if (isAssistants && endpointSupportsFiles && !isUploadDisabled) {
    return <AttachFile disabled={disableInputs} />;
  } else if (isAgents || (endpointSupportsFiles && !isUploadDisabled)) {
    return (
      <AttachFileMenu
        endpoint={endpoint}
        disabled={disableInputs}
        endpointType={endpointType}
        conversationId={conversationId}
        agentId={conversation?.agent_id}
        endpointFileConfig={endpointFileConfig}
      />
    );
  }
  return null;
}

export default memo(AttachFileChat);
