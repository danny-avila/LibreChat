import { Plus } from 'lucide-react';

import { useCallback, useEffect } from 'react';
import { useListAssistantsQuery } from 'librechat-data-provider/react-query';
import type { Assistant } from 'librechat-data-provider';
import type { UseFormReset, UseFormSetValue } from 'react-hook-form';
import type { AssistantForm, Actions, Option } from '~/common';
import SelectDropDown from '~/components/ui/SelectDropDown';
import { cn } from '~/utils/';

const keys = new Set(['name', 'id', 'description', 'instructions', 'model']);

type TAssistantOption = string | (Option & Assistant);

export default function AssistantSelect({
  reset,
  value,
  onChange,
  setValue,
  selectedAssistant,
}: {
  reset: UseFormReset<AssistantForm>;
  value: TAssistantOption;
  onChange: (value: TAssistantOption) => void;
  setValue: UseFormSetValue<AssistantForm>;
  selectedAssistant: string | null;
}) {
  const assistants = useListAssistantsQuery(
    {
      order: 'asc',
    },
    {
      select: (res) =>
        res.data.map((assistant) => ({
          ...assistant,
          label: assistant?.name ?? '',
          value: assistant.id,
        })),
    },
  );

  const onSelect = useCallback(
    (value: string) => {
      const assistant = assistants.data?.find((assistant) => assistant.id === value);
      if (!assistant) {
        reset();
        return;
      }

      const update = {
        ...assistant,
        label: assistant?.name ?? '',
        value: assistant?.id ?? '',
      };

      onChange(update);
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

      setValue(
        'functions',
        assistant?.tools
          ?.filter((tool) => tool.type === 'function')
          ?.map((tool) => tool.function?.name ?? '') ?? [],
      );

      Object.entries(assistant).forEach(([name, value]) => {
        if (typeof value === 'number') {
          return;
        } else if (typeof value === 'object') {
          return;
        }
        if (keys.has(name)) {
          setValue(name as keyof AssistantForm, value);
        }
      });

      Object.entries(actions).forEach(([name, value]) => setValue(name as keyof Actions, value));
    },
    [assistants.data, onChange, reset, setValue],
  );

  useEffect(() => {
    if (selectedAssistant && assistants.data) {
      onSelect(selectedAssistant);
    }
  }, [selectedAssistant, assistants.data, onSelect]);

  return (
    <SelectDropDown
      value={!value ? 'Create Assistant' : value}
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
      optionsClass="hover:bg-gray-20/50"
      optionsListClass="rounded-lg shadow-lg"
      currentValueClass={cn(
        'text-md font-semibold text-gray-900 dark:text-white',
        value === '' ? 'text-gray-500' : '',
      )}
      className={cn(
        'mt-1 rounded-md',
        'z-50 flex h-[40px] w-full flex-none items-center justify-center px-4 hover:cursor-pointer hover:border-green-500 focus:border-green-500',
      )}
      renderOption={() => (
        <span className="flex items-center gap-1.5 truncate">
          <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-gray-800 dark:text-gray-100">
            <Plus className="w-[16px]" />
          </span>
          <span className={cn('ml-4 flex h-6 items-center gap-1 text-gray-800 dark:text-gray-100')}>
            {'Create Assistant'}
          </span>
        </span>
      )}
    />
  );
}
