import { useEffect } from 'react';
import { useListAssistantsQuery } from 'librechat-data-provider/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/Select';
import { useSetIndexOptions } from '~/hooks';
import { useChatContext } from '~/Providers';
import { cn } from '~/utils';

interface SwitcherProps {
  isCollapsed: boolean;
}

export default function Switcher({ isCollapsed }: SwitcherProps) {
  const { setOption } = useSetIndexOptions();
  const { index, conversation } = useChatContext();
  /* `selectedAssistant` must be defined with `null` to cause re-render on update */
  const { assistant_id: selectedAssistant = null } = conversation ?? {};

  const setAssistant = setOption('assistant_id');

  const { data: assistants = [] } = useListAssistantsQuery(
    {
      order: 'asc',
    },
    {
      select: (res) => res.data.map(({ id, name }) => ({ id, name })),
    },
  );

  useEffect(() => {
    if (!selectedAssistant && assistants && assistants.length) {
      const assistant_id = localStorage.getItem(`assistant_id__${index}`) ?? assistants[0].id;
      setAssistant(assistant_id);
    }
  }, [index, assistants, selectedAssistant, setAssistant]);

  return (
    <Select defaultValue={selectedAssistant as string | undefined} onValueChange={setAssistant}>
      <SelectTrigger
        className={cn(
          'flex items-center gap-2 [&>span]:line-clamp-1 [&>span]:flex [&>span]:w-full [&>span]:items-center [&>span]:gap-1 [&>span]:truncate [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
          isCollapsed
            ? 'flex h-9 w-9 shrink-0 items-center justify-center p-0 [&>span]:w-auto [&>svg]:hidden'
            : '',
          'bg-white',
        )}
        aria-label="Select account"
      >
        <SelectValue placeholder="Select an Assistant">
          {/* TODO: assistant icon */}
          <span className={cn('ml-2', isCollapsed ? 'hidden' : '')}>
            {assistants.find((assistant) => assistant.id === selectedAssistant)?.name}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-white">
        {assistants.map((assistant) => (
          <SelectItem key={assistant.id} value={assistant.id}>
            <div className="[&_svg]:text-foreground flex items-center gap-3 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 ">
              {/* {TODO: assistant.icon} */}
              {assistant.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
