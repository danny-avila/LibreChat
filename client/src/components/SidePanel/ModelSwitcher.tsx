import { useMemo } from 'react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import MinimalIcon from '~/components/Endpoints/MinimalIcon';
import { useSetIndexOptions, useLocalize } from '~/hooks';
import type { SwitcherProps } from '~/common';
import { useChatContext } from '~/Providers';
import { Combobox } from '~/components/ui';

export default function ModelSwitcher({ isCollapsed }: SwitcherProps) {
  const localize = useLocalize();
  const modelsQuery = useGetModelsQuery();
  const { conversation } = useChatContext();
  const { setOption } = useSetIndexOptions();

  const { endpoint, model = null } = conversation ?? {};
  const models = useMemo(() => {
    return modelsQuery?.data?.[endpoint ?? ''] ?? [];
  }, [modelsQuery, endpoint]);

  const setModel = setOption('model');

  return (
    <Combobox
      selectPlaceholder={localize('com_ui_select_model')}
      searchPlaceholder={localize('com_ui_select_search_model')}
      isCollapsed={isCollapsed}
      ariaLabel={'model'}
      selectedValue={model ?? ''}
      setValue={setModel}
      items={models}
      SelectIcon={
        <MinimalIcon
          isCreatedByUser={false}
          endpoint={endpoint}
          // iconURL={} // for future preset icons
        />
      }
    />
  );
}
