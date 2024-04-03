import { defaultOrderQuery } from 'librechat-data-provider';
import { useListAssistantsQuery } from '~/data-provider';
import { mapAssistants } from '~/utils';

export default function useAssistantsMap({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { data: assistantMap = {} } = useListAssistantsQuery(defaultOrderQuery, {
    select: (res) => mapAssistants(res.data),
    enabled: isAuthenticated,
  });

  return assistantMap;
}
