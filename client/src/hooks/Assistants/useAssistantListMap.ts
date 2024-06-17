import { useMemo } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { AssistantListResponse, AssistantsEndpoint } from 'librechat-data-provider';
import type { AssistantListItem } from '~/common';
import { useListAssistantsQuery } from '~/data-provider';

const selectAssistantsResponse = (res: AssistantListResponse): AssistantListItem[] =>
  res.data.map(({ id, name, metadata, model }) => ({
    id,
    name: name ?? '',
    metadata,
    model,
  }));

export default function useAssistantListMap<T = AssistantListItem[] | null>(
  selector: (res: AssistantListResponse) => T = selectAssistantsResponse as (
    res: AssistantListResponse,
  ) => T,
): Record<AssistantsEndpoint, T> {
  const { data: assistantsList = null } = useListAssistantsQuery(
    EModelEndpoint.assistants,
    undefined,
    {
      select: selector,
    },
  );

  const { data: azureAssistants = null } = useListAssistantsQuery(
    EModelEndpoint.azureAssistants,
    undefined,
    {
      select: selector,
    },
  );

  const assistantListMap = useMemo(() => {
    return {
      [EModelEndpoint.assistants]: assistantsList as T,
      [EModelEndpoint.azureAssistants]: azureAssistants as T,
    };
  }, [assistantsList, azureAssistants]);

  return assistantListMap;
}
