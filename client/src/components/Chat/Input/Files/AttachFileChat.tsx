import { memo, useMemo } from 'react';
import {
  Constants,
  supportsFiles,
  mergeFileConfig,
  isAgentsEndpoint,
  isAssistantsEndpoint,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import type { EndpointFileConfig, TConversation } from 'librechat-data-provider';
import { useGetFileConfig } from '~/data-provider';
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
  const { endpoint, endpointType } = conversation ?? { endpoint: null };
  const isAgents = useMemo(() => isAgentsEndpoint(endpoint), [endpoint]);
  const isAssistants = useMemo(() => isAssistantsEndpoint(endpoint), [endpoint]);

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const endpointFileConfig = fileConfig.endpoints[endpoint ?? ''] as EndpointFileConfig | undefined;
  const endpointSupportsFiles: boolean = supportsFiles[endpointType ?? endpoint ?? ''] ?? false;
  const isUploadDisabled = (disableInputs || endpointFileConfig?.disabled) ?? false;

  if (isAssistants && endpointSupportsFiles && !isUploadDisabled) {
    return <AttachFile disabled={disableInputs} />;
  } else if (isAgents || (endpointSupportsFiles && !isUploadDisabled)) {
    return (
      <AttachFileMenu
        disabled={disableInputs}
        conversationId={conversationId}
        agentId={conversation?.agent_id}
        endpointFileConfig={endpointFileConfig}
      />
    );
  }
  return null;
}

export default memo(AttachFileChat);
