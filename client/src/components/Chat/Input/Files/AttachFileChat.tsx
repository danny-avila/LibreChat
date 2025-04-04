import { memo, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import {
  supportsFiles,
  mergeFileConfig,
  isAgentsEndpoint,
  EndpointFileConfig,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useGetFileConfig } from '~/data-provider';
import AttachFileMenu from './AttachFileMenu';
import AttachFile from './AttachFile';
import store from '~/store';

function AttachFileChat({ disableInputs }: { disableInputs: boolean }) {
  const { conversation } = useChatContext();

  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };

  const isAgents = useMemo(() => isAgentsEndpoint(_endpoint), [_endpoint]);

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const endpointFileConfig = fileConfig.endpoints[_endpoint ?? ''] as
    | EndpointFileConfig
    | undefined;

  const endpointSupportsFiles: boolean = supportsFiles[endpointType ?? _endpoint ?? ''] ?? false;
  const isUploadDisabled = (disableInputs || endpointFileConfig?.disabled) ?? false;

  if (isAgents) {
    return <AttachFileMenu disabled={disableInputs} />;
  }
  if (endpointSupportsFiles && !isUploadDisabled) {
    return <AttachFile disabled={disableInputs} />;
  }

  return null;
}

export default memo(AttachFileChat);
