import { memo } from 'react';
import {
  Constants,
  supportsFiles,
  mergeFileConfig,
  EndpointFileConfig,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useGetFileConfig } from '~/data-provider';
import AttachFileMenu from './AttachFileMenu';

function AttachFileChat({ disableInputs }: { disableInputs: boolean }) {
  const { conversation } = useChatContext();
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;
  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const endpointFileConfig = fileConfig.endpoints[_endpoint ?? ''] as
    | EndpointFileConfig
    | undefined;

  const endpointSupportsFiles: boolean = supportsFiles[endpointType ?? _endpoint ?? ''] ?? false;
  const isUploadDisabled = (disableInputs || endpointFileConfig?.disabled) ?? false;

  if (endpointSupportsFiles && !isUploadDisabled) {
    return <AttachFileMenu disabled={disableInputs} conversationId={conversationId} />;
  }

  return null;
}

export default memo(AttachFileChat);
