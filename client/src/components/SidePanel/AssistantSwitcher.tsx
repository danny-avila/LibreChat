import { useEffect, useMemo } from 'react';
import { Combobox } from '~/components/ui';
import { EModelEndpoint, defaultOrderQuery } from 'librechat-data-provider';
import type { SwitcherProps } from '~/common';
import { useSetIndexOptions, useSelectAssistant, useLocalize } from '~/hooks';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import { useListAssistantsQuery } from '~/data-provider';
import Icon from '~/components/Endpoints/Icon';

export default function AssistantSwitcher({ isCollapsed }: SwitcherProps) {
  const localize = useLocalize();
  const { setOption } = useSetIndexOptions();
  const { index, conversation } = useChatContext();

  /* `selectedAssistant` must be defined with `null` to cause re-render on update */
  const { assistant_id: selectedAssistant = null, endpoint } = conversation ?? {};

  const { data: assistants = [] } = useListAssistantsQuery(defaultOrderQuery, {
    select: (res) => res.data.map(({ id, name, metadata }) => ({ id, name, metadata })),
  });

  const assistantMap = useAssistantsMapContext();
  const { onSelect } = useSelectAssistant();

  useEffect(() => {
    if (!selectedAssistant && assistants && assistants.length && assistantMap) {
      const assistant_id =
        localStorage.getItem(`assistant_id__${index}`) ?? assistants[0]?.id ?? '';
      const assistant = assistantMap?.[assistant_id];

      if (!assistant) {
        return;
      }

      if (endpoint !== EModelEndpoint.assistants) {
        return;
      }

      setOption('model')(assistant.model);
      setOption('assistant_id')(assistant_id);
    }
  }, [index, assistants, selectedAssistant, assistantMap, endpoint, setOption]);

  const currentAssistant = assistantMap?.[selectedAssistant ?? ''];

  const assistantOptions = useMemo(() => {
    return assistants.map((assistant) => {
      return {
        label: assistant.name ?? '',
        value: assistant.id,
        icon: (
          <Icon
            isCreatedByUser={false}
            endpoint={EModelEndpoint.assistants}
            assistantName={assistant.name ?? ''}
            iconURL={(assistant.metadata?.avatar as string) ?? ''}
          />
        ),
      };
    });
  }, [assistants]);

  return (
    <Combobox
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
          endpoint={EModelEndpoint.assistants}
          assistantName={currentAssistant?.name ?? ''}
          iconURL={(currentAssistant?.metadata?.avatar as string) ?? ''}
        />
      }
    />
  );
}
