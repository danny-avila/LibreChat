import { Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Tools,
  FileSources,
  Capabilities,
  EModelEndpoint,
  LocalStorageKeys,
  isImageVisionTool,
  defaultAssistantFormValues,
} from 'librechat-data-provider';
import type { UseFormReset } from 'react-hook-form';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  Assistant,
  AssistantDocument,
  AssistantsEndpoint,
  AssistantCreateParams,
} from 'librechat-data-provider';
import type {
  Actions,
  ExtendedFile,
  AssistantForm,
  TAssistantOption,
  LastSelectedModels,
} from '~/common';
import SelectDropDown from '~/components/ui/SelectDropDown';
import { useListAssistantsQuery } from '~/data-provider';
import { useLocalize, useLocalStorage } from '~/hooks';
import { cn, createDropdownSetter } from '~/utils';
import { useFileMapContext } from '~/Providers';

const keys = new Set([
  'name',
  'id',
  'description',
  'instructions',
  'conversation_starters',
  'model',
  'append_today_date',
]);

export default function AssistantSelect({
  reset,
  value,
  endpoint,
  documentsMap,
  selectedAssistant,
  setCurrentAssistantId,
  createMutation,
}: {
  reset: UseFormReset<AssistantForm>;
  value: TAssistantOption;
  endpoint: AssistantsEndpoint;
  selectedAssistant: string | null;
  documentsMap: Map<string, AssistantDocument> | null;
  setCurrentAssistantId: React.Dispatch<React.SetStateAction<string | undefined>>;
  createMutation: UseMutationResult<Assistant, Error, AssistantCreateParams>;
}) {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const lastSelectedAssistant = useRef<string | null>(null);
  const [lastSelectedModels] = useLocalStorage<LastSelectedModels | undefined>(
    LocalStorageKeys.LAST_MODEL,
    {} as LastSelectedModels,
  );

  const query = useListAssistantsQuery(endpoint, undefined, {
    select: (res) =>
      res.data.map((_assistant) => {
        const source =
          endpoint === EModelEndpoint.assistants ? FileSources.openai : FileSources.azure;
        const assistant = {
          ..._assistant,
          label: _assistant.name ?? '',
          value: _assistant.id,
          files: _assistant.file_ids ? ([] as Array<[string, ExtendedFile]>) : undefined,
          code_files: _assistant.tool_resources?.code_interpreter?.file_ids
            ? ([] as Array<[string, ExtendedFile]>)
            : undefined,
        };

        const handleFile = (file_id: string, list?: Array<[string, ExtendedFile]>) => {
          const file = fileMap?.[file_id];
          if (file) {
            list?.push([
              file_id,
              {
                file_id: file.file_id,
                type: file.type,
                filepath: file.filepath,
                filename: file.filename,
                width: file.width,
                height: file.height,
                size: file.bytes,
                preview: file.filepath,
                progress: 1,
                source,
              },
            ]);
          } else {
            list?.push([
              file_id,
              {
                file_id,
                type: '',
                filename: '',
                size: 1,
                progress: 1,
                filepath: endpoint,
                source,
              },
            ]);
          }
        };

        if (assistant.files && _assistant.file_ids) {
          _assistant.file_ids.forEach((file_id) => handleFile(file_id, assistant.files));
        }

        if (assistant.code_files && _assistant.tool_resources?.code_interpreter?.file_ids) {
          _assistant.tool_resources.code_interpreter.file_ids.forEach((file_id) =>
            handleFile(file_id, assistant.code_files),
          );
        }

        const assistantDoc = documentsMap?.get(_assistant.id);
        /* If no user updates, use the latest assistant docs */
        if (assistantDoc) {
          if (!assistant.conversation_starters) {
            assistant.conversation_starters = assistantDoc.conversation_starters;
          }
          assistant.append_today_date = assistantDoc.append_today_date ?? false;
        }

        return assistant;
      }),
  });

  const onSelect = useCallback(
    (value: string) => {
      const assistant = query.data?.find((assistant) => assistant.id === value);

      createMutation.reset();
      if (!assistant) {
        setCurrentAssistantId(undefined);
        return reset({
          ...defaultAssistantFormValues,
          model: lastSelectedModels?.[endpoint] ?? '',
        });
      }

      const update = {
        ...assistant,
        label: assistant.name ?? '',
        value: assistant.id ?? '',
      };

      const actions: Actions = {
        [Capabilities.code_interpreter]: false,
        [Capabilities.image_vision]: false,
        [Capabilities.retrieval]: false,
      };

      (assistant.tools ?? [])
        .filter((tool) => tool.type !== 'function' || isImageVisionTool(tool))
        .map((tool) => tool.function?.name || tool.type)
        .forEach((tool) => {
          if (tool === Tools.file_search) {
            actions[Capabilities.retrieval] = true;
          }
          actions[tool] = true;
        });

      const functions = (assistant.tools ?? [])
        .filter((tool) => tool.type === 'function' && !isImageVisionTool(tool))
        .map((tool) => tool.function?.name ?? '');

      const formValues: Partial<AssistantForm & Actions> = {
        functions,
        ...actions,
        assistant: update,
        model: update.model,
      };

      Object.entries(assistant).forEach(([name, value]) => {
        if (!keys.has(name)) {
          return;
        }

        if (name === 'append_today_date') {
          formValues[name] = !!value;
          return;
        }

        if (
          name === 'conversation_starters' &&
          Array.isArray(value) &&
          value.every((item) => typeof item === 'string')
        ) {
          formValues[name] = value;
          return;
        }

        if (typeof value !== 'number' && typeof value !== 'object') {
          formValues[name] = value;
        }
      });

      reset(formValues);
      setCurrentAssistantId(assistant.id);
    },
    [query.data, reset, setCurrentAssistantId, createMutation, endpoint, lastSelectedModels],
  );

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;

    if (selectedAssistant === lastSelectedAssistant.current) {
      return;
    }

    if (selectedAssistant !== '' && selectedAssistant != null && query.data) {
      timerId = setTimeout(() => {
        lastSelectedAssistant.current = selectedAssistant;
        onSelect(selectedAssistant);
      }, 5);
    }

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [selectedAssistant, query.data, onSelect]);

  const createAssistant = localize('com_ui_create') + ' ' + localize('com_ui_assistant');
  return (
    <SelectDropDown
      value={!value ? createAssistant : value}
      setValue={createDropdownSetter(onSelect)}
      availableValues={
        query.data ?? [
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
      containerClassName="flex-grow"
      searchClassName="dark:from-gray-850"
      searchPlaceholder={localize('com_assistants_search_name')}
      optionsClass="hover:bg-gray-20/50 dark:border-gray-700"
      optionsListClass="rounded-lg shadow-lg dark:bg-gray-850 dark:border-gray-700 dark:last:border"
      currentValueClass={cn(
        'text-md font-semibold text-gray-900 dark:text-white',
        value === '' ? 'text-gray-500' : '',
      )}
      className={cn(
        'mt-1 rounded-md dark:border-gray-700 dark:bg-gray-850',
        'z-50 flex h-[40px] w-full flex-none items-center justify-center px-4 hover:cursor-pointer hover:border-green-500 focus:border-gray-400',
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
