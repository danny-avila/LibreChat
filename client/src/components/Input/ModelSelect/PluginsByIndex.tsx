import { useRecoilValue } from 'recoil';
import { ChevronDownIcon } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useAvailablePluginsQuery } from 'librechat-data-provider/react-query';
import type { TPlugin } from 'librechat-data-provider';
import type { TModelSelectProps } from '~/common';
import {
  Button,
  MultiSelectPop,
  SelectDropDown,
  SelectDropDownPop,
  MultiSelectDropDown,
} from '~/components/ui';
import { useSetIndexOptions, useAuthContext, useMediaQuery, useLocalize } from '~/hooks';
import { cn, cardStyle, selectPlugins, processPlugins } from '~/utils';
import store from '~/store';

export default function PluginsByIndex({
  conversation,
  setOption,
  models,
  showAbove,
  popover = false,
}: TModelSelectProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const [visible, setVisibility] = useState<boolean>(true);
  const isSmallScreen = useMediaQuery('(max-width: 640px)');
  const availableTools = useRecoilValue(store.availableTools);
  const { checkPluginSelection, setTools } = useSetIndexOptions();

  const { data: allPlugins } = useAvailablePluginsQuery({
    enabled: !!user?.plugins,
    select: selectPlugins,
  });

  useEffect(() => {
    if (isSmallScreen) {
      setVisibility(false);
    }
  }, [isSmallScreen]);

  const conversationTools: TPlugin[] = useMemo(() => {
    if (!conversation?.tools) {
      return [];
    }
    return processPlugins(conversation.tools, allPlugins?.map);
  }, [conversation, allPlugins]);

  const availablePlugins = useMemo(() => {
    if (!availableTools) {
      return [];
    }

    return Object.values(availableTools);
  }, [availableTools]);

  if (!conversation) {
    return null;
  }

  const Menu = popover ? SelectDropDownPop : SelectDropDown;
  const PluginsMenu = popover ? MultiSelectPop : MultiSelectDropDown;

  return (
    <>
      <Button
        type="button"
        className={cn(
          cardStyle,
          'z-40 flex h-[40px] min-w-4 flex-none items-center justify-center px-3 hover:bg-white focus:ring-0 focus:ring-offset-0 dark:hover:bg-gray-700',
        )}
        onClick={() => setVisibility((prev) => !prev)}
      >
        <ChevronDownIcon
          className={cn(
            !visible ? '' : 'rotate-180 transform',
            'w-4 text-gray-600 dark:text-white',
          )}
        />
      </Button>
      {visible && (
        <>
          <Menu
            value={conversation.model ?? ''}
            setValue={setOption('model')}
            availableValues={models}
            showAbove={showAbove}
            showLabel={false}
            className={cn(
              cardStyle,
              'z-50 flex h-[40px] w-48 min-w-48 flex-none items-center justify-center px-4 hover:cursor-pointer',
            )}
          />
          <PluginsMenu
            showAbove={false}
            showLabel={false}
            setSelected={setTools}
            value={conversationTools}
            optionValueKey="pluginKey"
            availableValues={availablePlugins}
            isSelected={checkPluginSelection}
            searchPlaceholder={localize('com_ui_select_search_plugin')}
          />
        </>
      )}
    </>
  );
}
