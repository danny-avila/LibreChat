import { EModelEndpoint } from 'librechat-data-provider';
import type { TAssistantsMap } from 'librechat-data-provider';
import { useListAssistantsQuery } from '~/data-provider';
import { mapAssistants } from '~/utils';

export default function useAssistantsMap({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}): TAssistantsMap | undefined {
  const { data: assistants = {} } = useListAssistantsQuery(EModelEndpoint.assistants, undefined, {
    select: (res) => mapAssistants(res.data),
    enabled: isAuthenticated,
  });
  const { data: azureAssistants = {} } = useListAssistantsQuery(
    EModelEndpoint.azureAssistants,
    undefined,
    {
      select: (res) => mapAssistants(res.data),
      enabled: isAuthenticated,
    },
  );

  return {
    [EModelEndpoint.assistants]: assistants,
    [EModelEndpoint.azureAssistants]: azureAssistants,
  };
}
