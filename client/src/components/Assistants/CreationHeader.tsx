import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useListAssistantsQuery } from 'librechat-data-provider';
import type { UseFormReset } from 'react-hook-form';
import type { CreationForm, Actions, Option } from '~/common';
import SelectDropDown from '~/components/ui/SelectDropDown';
import { cn } from '~/utils/';

export default function CreationHeader({ reset }: { reset: UseFormReset<CreationForm> }) {
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
  const [assistantOption, setAssistant] = useState<string | Option>('Create Assistant');

  const onSelect = (value: string) => {
    if (!value || value === 'Create Assistant') {
      return;
    }
    const assistant = assistants.data?.find((assistant) => assistant.id === value);
    setAssistant({
      ...assistant,
      label: assistant?.name ?? '',
      value: assistant?.id ?? '',
    });
    const actions: Actions = {
      function: false,
      code_interpreter: false,
      retrieval: false,
    };
    assistant?.tools
      ?.map((tool) => tool.type)
      .forEach((tool) => {
        actions[tool] = true;
      });
    reset({
      ...assistant,
      ...actions,
    });
  };

  return (
    <SelectDropDown
      value={assistantOption}
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
        'text-md font-semibold text-gray-900 dark:text-gray-100',
        assistantOption === 'Create Assistant' ? 'text-gray-500' : '',
      )}
      className={cn(
        'rounded-none',
        'z-50 flex h-[40px] w-full flex-none items-center justify-center px-4 hover:cursor-pointer hover:border-green-500 focus:border-green-500',
      )}
      renderOption={() => (
        <span
          className="flex items-center gap-1.5 truncate"
          onClick={() => {
            reset({
              id: '',
            });
            setAssistant('Create Assistant');
          }}
        >
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
