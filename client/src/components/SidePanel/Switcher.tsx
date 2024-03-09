import { useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/Select';
import { EModelEndpoint, defaultOrderQuery } from 'librechat-data-provider';
import { useSetIndexOptions, useSelectAssistant, useLocalize } from '~/hooks';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import { useListAssistantsQuery } from '~/data-provider';
import Icon from '~/components/Endpoints/Icon';
import { cn } from '~/utils';

interface SwitcherProps {
  isCollapsed: boolean;
}

export default function Switcher({ isCollapsed }: SwitcherProps) {
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

  return (
    <Select defaultValue={selectedAssistant as string | undefined} onValueChange={onSelect}>
      <SelectTrigger
        className={cn(
          'flex items-center gap-2 [&>span]:line-clamp-1 [&>span]:flex [&>span]:w-full [&>span]:items-center [&>span]:gap-1 [&>span]:truncate [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
          isCollapsed
            ? 'flex h-9 w-9 shrink-0 items-center justify-center p-0 [&>span]:w-auto [&>svg]:hidden'
            : '',
          'bg-white text-black hover:bg-gray-50 dark:bg-gray-900 dark:text-white',
        )}
        aria-label={localize('com_sidepanel_select_assistant')}
      >
        <SelectValue placeholder={localize('com_sidepanel_select_assistant')}>
          <div className="assistant-item flex items-center justify-center overflow-hidden rounded-full">
            <Icon
              isCreatedByUser={false}
              endpoint={EModelEndpoint.assistants}
              assistantName={currentAssistant?.name ?? ''}
              iconURL={(currentAssistant?.metadata?.avatar as string) ?? ''}
            />
          </div>
          <span className={cn('ml-2', isCollapsed ? 'hidden' : '')} style={{ userSelect: 'none' }}>
            {assistants.find((assistant) => assistant.id === selectedAssistant)?.name ??
              localize('com_sidepanel_select_assistant')}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-white dark:bg-gray-800">
        {assistants.map((assistant) => (
          <SelectItem
            key={assistant.id}
            value={assistant.id}
            className="hover:bg-gray-50 dark:text-white"
          >
            <div className="[&_svg]:text-foreground flex items-center justify-center gap-3 dark:text-white [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0">
              <div className="assistant-item overflow-hidden rounded-full ">
                <Icon
                  isCreatedByUser={false}
                  endpoint={EModelEndpoint.assistants}
                  assistantName={assistant.name ?? ''}
                  iconURL={(assistant.metadata?.avatar as string) ?? ''}
                />
              </div>
              {assistant.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
