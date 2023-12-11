import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import { useChatContext } from '~/Providers/ChatContext';
import useUserKey from './useUserKey';

export default function useRequiresKey() {
  const { conversation } = useChatContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { endpoint } = conversation || {};
  const userProvidesKey = endpointsConfig?.[endpoint ?? '']?.userProvide;
  const { getExpiry } = useUserKey(endpoint ?? '');
  const expiryTime = getExpiry();
  const requiresKey = !expiryTime && userProvidesKey;
  return { requiresKey };
}
