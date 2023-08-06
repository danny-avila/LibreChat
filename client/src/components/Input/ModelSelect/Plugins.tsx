import { useRecoilState } from 'recoil';
import { useState, useEffect } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { useAvailablePluginsQuery, TPlugin } from 'librechat-data-provider';
import type { TModelSelectProps } from '~/common';
import { SelectDropDown, MultiSelectDropDown, Button } from '~/components/ui';
import { useSetOptions, useAuthContext, useMediaQuery } from '~/hooks';
import { cn, cardStyle } from '~/utils/';
import store from '~/store';

const pluginStore: TPlugin = {
  name: 'Plugin store',
  pluginKey: 'pluginStore',
  isButton: true,
  description: '',
  icon: '',
  authConfig: [],
  authenticated: false,
};

export default function Plugins({ conversation, setOption, models }: TModelSelectProps) {
  const { data: allPlugins } = useAvailablePluginsQuery();
  const [visible, setVisibility] = useState<boolean>(true);
  const [availableTools, setAvailableTools] = useRecoilState(store.availableTools);
  const { checkPluginSelection, setTools } = useSetOptions();
  const { user } = useAuthContext();
  const isSmallScreen = useMediaQuery('(max-width: 640px)');

  useEffect(() => {
    if (isSmallScreen) {
      setVisibility(false);
    }
  }, [isSmallScreen]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (!allPlugins) {
      return;
    }

    if (!user.plugins || user.plugins.length === 0) {
      setAvailableTools([pluginStore]);
      return;
    }

    const tools = [...user.plugins]
      .map((el) => allPlugins.find((plugin: TPlugin) => plugin.pluginKey === el))
      .filter((el): el is TPlugin => el !== undefined);

    /* Filter Last Selected Tools */
    const localStorageItem = localStorage.getItem('lastSelectedTools');
    if (!localStorageItem) {
      return setAvailableTools([...tools, pluginStore]);
    }
    const lastSelectedTools = JSON.parse(localStorageItem);
    const filteredTools = lastSelectedTools.filter((tool: TPlugin) =>
      tools.some((existingTool) => existingTool.pluginKey === tool.pluginKey),
    );
    localStorage.setItem('lastSelectedTools', JSON.stringify(filteredTools));

    setAvailableTools([...tools, pluginStore]);
    // setAvailableTools is a recoil state setter, so it's safe to use it in useEffect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlugins, user]);

  if (!conversation) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        className={cn(
          cardStyle,
          'min-w-4 z-40 flex h-[40px] flex-none items-center justify-center px-3 hover:bg-white focus:ring-0 focus:ring-offset-0 dark:hover:bg-gray-700',
        )}
        onClick={() => setVisibility((prev) => !prev)}
      >
        <ChevronDownIcon
          className={cn(
            !visible ? 'rotate-180 transform' : '',
            'w-4 text-gray-600 dark:text-white',
          )}
        />
      </Button>
      <SelectDropDown
        value={conversation.model ?? ''}
        setValue={setOption('model')}
        availableValues={models}
        showAbove={true}
        className={cn(cardStyle, 'min-w-60 z-40 flex w-64 sm:w-48', visible ? '' : 'hidden')}
      />
      <MultiSelectDropDown
        value={conversation.tools || []}
        isSelected={checkPluginSelection}
        setSelected={setTools}
        availableValues={availableTools}
        optionValueKey="pluginKey"
        showAbove={true}
        className={cn(cardStyle, 'min-w-60 z-50 w-64 sm:w-48', visible ? '' : 'hidden')}
      />
    </>
  );
}
