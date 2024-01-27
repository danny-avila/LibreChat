import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useWatch } from 'react-hook-form';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { Tools, EModelEndpoint, QueryKeys } from 'librechat-data-provider';
import type { FunctionTool, TPlugin } from 'librechat-data-provider';
import type { AssistantForm, Actions, AssistantPanelProps } from '~/common';
import { useCreateAssistantMutation, useUpdateAssistantMutation } from '~/data-provider';
import { ToolSelectDialog } from '~/components/Tools';
import { Separator } from '~/components/ui/Separator';
import { useAssistantsContext } from '~/Providers';
import { SelectDropDown } from '~/components/ui';
import { Switch } from '~/components/ui/Switch';
import AssistantAvatar from './AssistantAvatar';
import AssistantSelect from './AssistantSelect';
import ContextButton from './ContextButton';
import AssistantTool from './AssistantTool';
import { Spinner } from '~/components/svg';
import { cn, cardStyle } from '~/utils/';
import { useNewConvo } from '~/hooks';
import { Panel } from '~/common';

const labelClass = 'mb-2 block text-xs font-bold text-gray-700 dark:text-gray-400';
const inputClass =
  'focus:shadow-outline w-full appearance-none rounded-md border px-3 py-2 text-sm leading-tight text-gray-700 dark:text-white shadow focus:border-green-500 focus:outline-none focus:ring-0 dark:bg-gray-800 dark:border-gray-700/80';

export default function AssistantPanel({
  index = 0,
  setActivePanel,
  assistant_id: current_assistant_id,
}: AssistantPanelProps) {
  const queryClient = useQueryClient();
  const modelsQuery = useGetModelsQuery();
  const { switchToConversation } = useNewConvo(index);
  const [showToolDialog, setShowToolDialog] = useState(false);
  const { control, handleSubmit, reset } = useAssistantsContext();
  const allTools = queryClient.getQueryData<TPlugin[]>([QueryKeys.tools]) ?? [];

  /* Mutations */
  const create = useCreateAssistantMutation();
  const update = useUpdateAssistantMutation();
  const assistant_id = useWatch({ control, name: 'id' });
  const assistant = useWatch({ control, name: 'assistant' });
  const functions = useWatch({ control, name: 'functions' });

  const onSubmit = (data: AssistantForm) => {
    const tools: Array<FunctionTool | string> = [...functions];

    console.log(data);
    if (data.code_interpreter) {
      tools.push({ type: Tools.code_interpreter });
    }
    if (data.retrieval) {
      tools.push({ type: Tools.retrieval });
    }

    const {
      name,
      description,
      instructions,
      model,
      // file_ids, // TODO: add file handling here
    } = data;

    if (assistant_id) {
      update.mutate({
        assistant_id,
        data: {
          name,
          description,
          instructions,
          model,
          tools,
        },
      });
      return;
    }

    create.mutate({
      name,
      description,
      instructions,
      model,
      tools,
    });
  };

  // Render function for the Switch component
  const renderSwitch = (name: keyof Actions) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Switch
          {...field}
          checked={field.value}
          onCheckedChange={field.onChange}
          className="relative inline-flex h-6 w-11 items-center rounded-full data-[state=checked]:bg-green-500"
          value={field?.value?.toString()}
        />
      )}
    />
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="h-auto w-full flex-shrink-0 overflow-x-hidden"
    >
      <Controller
        name="assistant"
        control={control}
        render={({ field }) => (
          <AssistantSelect
            reset={reset}
            value={field.value}
            selectedAssistant={current_assistant_id ?? null}
          />
        )}
      />
      <div className="h-auto bg-white px-4 pb-8 pt-3 dark:bg-transparent">
        {/* Avatar & Name */}
        <div className="mb-4">
          <AssistantAvatar
            assistant_id={assistant_id}
            metadata={typeof assistant !== 'string' ? assistant.metadata : null}
          />
          <label className={labelClass} htmlFor="name">
            Name
          </label>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                {...{ max: 256 }}
                className={inputClass}
                id="name"
                type="text"
                placeholder="Optional: The name of the assistant"
              />
            )}
          />
          <Controller
            name="id"
            control={control}
            render={({ field }) => (
              <p className="h-3 text-xs italic text-gray-600">{field.value ?? ''}</p>
            )}
          />
        </div>
        {/* Description */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="description">
            Description
          </label>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                {...{ max: 512 }}
                className={inputClass}
                id="description"
                type="text"
                placeholder="Optional: Describe your Assistant here"
              />
            )}
          />
        </div>

        {/* Instructions */}
        <div className="mb-6">
          <label className={labelClass} htmlFor="instructions">
            Instructions
          </label>
          <Controller
            name="instructions"
            control={control}
            render={({ field }) => (
              <textarea
                {...field}
                value={field.value ?? ''}
                {...{ max: 32768 }}
                className="focus:shadow-outline min-h-[150px] w-full resize-none resize-y appearance-none rounded-md border px-3 py-2 text-sm leading-tight text-gray-700 shadow focus:border-green-500 focus:outline-none focus:ring-0 dark:border-gray-700/80 dark:bg-gray-800 dark:text-white"
                id="instructions"
                placeholder="The system instructions that the assistant uses"
                rows={3}
              />
            )}
          />
        </div>

        {/* Model */}
        <div className="mb-6">
          <label className={labelClass} htmlFor="model">
            Model
          </label>
          <Controller
            name="model"
            control={control}
            render={({ field }) => (
              <SelectDropDown
                emptyTitle={true}
                value={field.value}
                setValue={field.onChange}
                availableValues={modelsQuery.data?.[EModelEndpoint.assistant] ?? []}
                showAbove={false}
                showLabel={false}
                className={cn(
                  cardStyle,
                  'flex h-[40px] w-full flex-none items-center justify-center px-4 hover:cursor-pointer',
                )}
              />
            )}
          />
        </div>

        {/* Tools */}
        <div className="mb-6">
          <label className={labelClass}>Tools</label>
          <div className="space-y-1">
            {functions.map((func) => (
              <AssistantTool key={func} tool={func} allTools={allTools} />
            ))}
            <button
              type="button"
              onClick={() => setShowToolDialog(true)}
              className="btn btn-neutral border-token-border-light relative mt-2 h-8 rounded-lg font-medium"
            >
              <div className="flex w-full items-center justify-center gap-2">
                Add Tools {/* TODO: Add localization */}
              </div>
            </button>
          </div>
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between"></div>
            <Separator orientation="horizontal" className="bg-gray-100/50" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                Code Interpreter
              </span>
              {renderSwitch('code_interpreter')}
            </div>
            <Separator orientation="horizontal" className="bg-gray-100/50" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                Retrieval
              </span>
              {renderSwitch('retrieval')}
            </div>
            <Separator orientation="horizontal" className="bg-gray-100/50" />
          </div>
          <label className={cn(labelClass, 'mt-2')}>Actions</label>
          <div className="space-y-1">
            {[].map((func) => (
              <AssistantTool key={func} tool={func} allTools={allTools} />
            ))}
            <button
              type="button"
              onClick={() => setActivePanel(Panel.actions)}
              className="btn btn-neutral border-token-border-light relative mt-2 h-8 rounded-lg font-medium"
            >
              <div className="flex w-full items-center justify-center gap-2">
                Add Actions {/* TODO: Add localization */}
              </div>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end">
          <ContextButton assistant_id={assistant_id} />
          {/* Use Button */}
          {assistant_id && (
            <button
              className="focus:shadow-outline mx-2 rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0"
              type="button"
              disabled={!assistant_id}
              onClick={(e) => {
                e.preventDefault();
                switchToConversation({
                  endpoint: EModelEndpoint.assistant,
                  conversationId: 'new',
                  assistant_id,
                  title: null,
                  createdAt: '',
                  updatedAt: '',
                });
              }}
            >
              Use
            </button>
          )}
          {/* Submit Button */}
          <button
            className="focus:shadow-outline flex w-1/4 items-center justify-center rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0"
            type="submit"
          >
            {/* TODO: Add localization */}
            {create.isLoading || update.isLoading ? (
              <Spinner className="icon-md" />
            ) : assistant_id ? (
              'Save'
            ) : (
              'Create'
            )}
          </button>
        </div>
      </div>
      <ToolSelectDialog isOpen={showToolDialog} setIsOpen={setShowToolDialog} />
    </form>
  );
}
