import { useEffect, useMemo } from 'react';
import SimpleCombobox from '~/components/ui/SimpleCombobox';
import { isAssistantsEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type { AssistantsEndpoint } from 'librechat-data-provider';
import type { SwitcherProps, AssistantListItem } from '~/common';
import { useSetIndexOptions, useSelectAssistant, useLocalize, useAssistantListMap } from '~/hooks';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import Icon from '~/components/Endpoints/Icon';

export default function AssistantSwitcher({ isCollapsed }: SwitcherProps) {
  const localize = useLocalize();
  const { setOption } = useSetIndexOptions();
  const { index, conversation } = useChatContext();

  /* `selectedAssistant` must be defined with `null` to cause re-render on update */
  const { assistant_id: selectedAssistant = null, endpoint } = conversation ?? {};

  const assistantListMap = useAssistantListMap((res) =>
    res.data.map(({ id, name, metadata }) => ({ id, name, metadata })),
  );
  const assistants: Omit<AssistantListItem, 'model'>[] = useMemo(
    () => assistantListMap[endpoint ?? ''] ?? [],
    [endpoint, assistantListMap],
  );
  const assistantMap = useAssistantsMapContext();
  const { onSelect } = useSelectAssistant(endpoint as AssistantsEndpoint);

  useEffect(() => {
    if (!selectedAssistant && assistants && assistants.length && assistantMap) {
      const assistant_id =
        localStorage.getItem(`${LocalStorageKeys.ASST_ID_PREFIX}${index}${endpoint}`) ??
        assistants[0]?.id ??
        '';
      const assistant = assistantMap[endpoint ?? ''][assistant_id];

      if (!assistant) {
        return;
      }

      if (!isAssistantsEndpoint(endpoint)) {
        return;
      }

      setOption('model')(assistant.model);
      setOption('assistant_id')(assistant_id);
    }
  }, [index, assistants, selectedAssistant, assistantMap, endpoint, setOption]);

  const currentAssistant = assistantMap?.[endpoint ?? '']?.[selectedAssistant ?? ''];

  const assistantOptions = useMemo(() => {
    return assistants.map((assistant) => {
      return {
        label: assistant.name ?? '',
        value: assistant.id,
        icon: (
          <Icon
            isCreatedByUser={false}
            endpoint={endpoint}
            assistantName={assistant.name ?? ''}
            iconURL={(assistant.metadata?.avatar as string) ?? ''}
          />
        ),
      };
    });
  }, [assistants, endpoint]);

  return (
    <SimpleCombobox
      selectedValue={currentAssistant?.id ?? ''}
      displayValue={
        assistants.find((assistant) => assistant.id === selectedAssistant)?.name ??
        localize('com_sidepanel_select_assistant')
      }
      selectPlaceholder={localize('com_sidepanel_select_assistant')}
      searchPlaceholder={localize('com_assistants_search_name')}
      isCollapsed={isCollapsed}
      ariaLabel={'assistant'}
      setValue={onSelect}
      items={assistantOptions}
      SelectIcon={
        <Icon
          isCreatedByUser={false}
          endpoint={endpoint}
          assistantName={currentAssistant?.name ?? ''}
          iconURL={(currentAssistant?.metadata?.avatar as string) ?? ''}
        />
      }
    />
  );
}
