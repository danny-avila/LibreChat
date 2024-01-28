import { Plus } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { defaultAssistantFormValues, defaultOrderQuery } from 'librechat-data-provider';
import type { Assistant } from 'librechat-data-provider';
import type { UseFormReset } from 'react-hook-form';
import type { AssistantForm, Actions, Option } from '~/common';
import SelectDropDown from '~/components/ui/SelectDropDown';
import { useListAssistantsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils/';

const keys = new Set(['name', 'id', 'description', 'instructions', 'model']);

type TAssistantOption = string | (Option & Assistant);

export default function AssistantSelect({
  reset,
  value,
  selectedAssistant,
  setCurrentAssistantId,
}: {
  reset: UseFormReset<AssistantForm>;
  value: TAssistantOption;
  selectedAssistant: string | null;
  setCurrentAssistantId: React.Dispatch<React.SetStateAction<string | undefined>>;
}) {
  const localize = useLocalize();

  const assistants = useListAssistantsQuery(defaultOrderQuery, {
    select: (res) =>
      res.data.map((assistant) => ({
        ...assistant,
        label: assistant?.name ?? '',
        value: assistant.id,
      })),
  });

  const onSelect = useCallback(
    (value: string) => {
      const assistant = assistants.data?.find((assistant) => assistant.id === value);

      if (!assistant) {
        setCurrentAssistantId(undefined);
        return reset(defaultAssistantFormValues);
      }

      const update = {
        ...assistant,
        label: assistant?.name ?? '',
        value: assistant?.id ?? '',
      };

      const actions: Actions = {
        code_interpreter: false,
        retrieval: false,
      };

      assistant?.tools
        ?.filter((tool) => tool.type !== 'function')
        ?.map((tool) => tool.type)
        .forEach((tool) => {
          actions[tool] = true;
        });

      const functions =
        assistant?.tools
          ?.filter((tool) => tool.type === 'function')
          ?.map((tool) => tool.function?.name ?? '') ?? [];

      const formValues: Partial<AssistantForm & Actions> = {
        functions,
        ...actions,
        assistant: update,
      };

      Object.entries(assistant).forEach(([name, value]) => {
        if (typeof value === 'number') {
          return;
        } else if (typeof value === 'object') {
          return;
        }
        if (keys.has(name)) {
          formValues[name] = value;
        }
      });

      reset(formValues);
      setCurrentAssistantId(assistant?.id);
    },
    [assistants.data, reset, setCurrentAssistantId],
  );

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;

    if (selectedAssistant && assistants.data) {
      timerId = setTimeout(() => {
        onSelect(selectedAssistant);
      }, 5);
    }

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [selectedAssistant, assistants.data, onSelect]);

  const createAssistant = localize('com_ui_create') + ' ' + localize('com_ui_assistant');
  return (
    <SelectDropDown
      value={!value ? createAssistant : value}
      setValue={onSelect}
      availableValues={
        assistants.data ?? [
          {
            label: 'Loading...',
            value: '',
          },
        ]
      }
      iconSide="left"
      showAbove={false}
      showLabel={false}
      emptyTitle={true}
      optionsClass="hover:bg-gray-20/50 dark:border-gray-700"
      optionsListClass="rounded-lg shadow-lg dark:bg-black dark:border-gray-700 dark:last:border"
      currentValueClass={cn(
        'text-md font-semibold text-gray-900 dark:text-white',
        value === '' ? 'text-gray-500' : '',
      )}
      className={cn(
        'mt-1 rounded-md dark:border-gray-700 dark:bg-black',
        'z-50 flex h-[40px] w-full flex-none items-center justify-center px-4 hover:cursor-pointer hover:border-green-500 focus:border-green-500',
      )}
      renderOption={() => (
        <span className="flex items-center gap-1.5 truncate">
          <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-gray-800 dark:text-gray-100">
            <Plus className="w-[16px]" />
          </span>
          <span className={cn('ml-4 flex h-6 items-center gap-1 text-gray-800 dark:text-gray-100')}>
            {createAssistant}
          </span>
        </span>
      )}
    />
  );
}
