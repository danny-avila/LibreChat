import { useMemo } from 'react';
import { alternateName, EModelEndpoint } from 'librechat-data-provider';
import { useChatContext } from '~/Providers/ChatContext';
import { useGetEndpointsQuery } from '~/data-provider';
import { getEndpointField } from '~/utils';
import useUserKey from './useUserKey';

const formatEndpointLabel = ({
  endpoint,
  endpointType,
}: {
  endpoint?: string | null;
  endpointType?: string | null;
}) => {
  const lookupKey = (endpointType ?? endpoint ?? '') as keyof typeof alternateName;
  if (!lookupKey) {
    return '';
  }

  return alternateName[lookupKey] ?? lookupKey;
};

export default function useRequiresKey() {
  const { conversation } = useChatContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const endpoint = conversation?.endpoint ?? null;
  const endpointType = getEndpointField(endpointsConfig, endpoint, 'type');
  const userProvidesKey: boolean | null | undefined = getEndpointField(
    endpointsConfig,
    endpoint,
    'userProvide',
  );

  const { getExpiry, checkExpiry } = useUserKey(endpoint ?? '');
  const expiryTime = getExpiry();
  const hasValidKey = expiryTime ? checkExpiry() : false;
  const isExpired = !!expiryTime && !hasValidKey;

  const requiresKey = !!userProvidesKey && (!expiryTime || isExpired);
  const endpointLabel = useMemo(
    () => formatEndpointLabel({ endpoint, endpointType }),
    [endpoint, endpointType],
  );

  return {
    requiresKey,
    endpoint: endpoint ?? undefined,
    endpointType: (endpointType as EModelEndpoint | undefined) ?? undefined,
    endpointLabel,
    expiryTime,
    isExpired,
  };
}
