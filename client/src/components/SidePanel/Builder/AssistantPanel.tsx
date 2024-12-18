import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, FormProvider, Controller, useWatch } from 'react-hook-form';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import {
  Tools,
  QueryKeys,
  Capabilities,
  actionDelimiter,
  ImageVisionTool,
  defaultAssistantFormValues,
} from 'librechat-data-provider';
import type { FunctionTool, TConfig, TPlugin } from 'librechat-data-provider';
import type { AssistantForm, AssistantPanelProps } from '~/common';
import { useCreateAssistantMutation, useUpdateAssistantMutation } from '~/data-provider';
import { cn, cardStyle, defaultTextProps, removeFocusOutlines } from '~/utils';
import AssistantConversationStarters from './AssistantConversationStarters';
import { useAssistantsMapContext, useToastContext } from '~/Providers';
import { useSelectAssistant, useLocalize } from '~/hooks';
import { ToolSelectDialog } from '~/components/Tools';
import CapabilitiesForm from './CapabilitiesForm';
import AppendDateCheckbox from './AppendDateCheckbox';
import { SelectDropDown } from '~/components/ui';
import AssistantAvatar from './AssistantAvatar';
import AssistantSelect from './AssistantSelect';
import ContextButton from './ContextButton';
import AssistantTool from './AssistantTool';
import { Spinner } from '~/components/svg';
import Knowledge from './Knowledge';
import { Panel } from '~/common';
import Action from './Action';

const labelClass = 'mb-2 text-token-text-primary block font-medium';
const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 dark:border-gray-800 dark:bg-gray-800 rounded-xl mb-2',
  removeFocusOutlines,
);

export default function AssistantPanel({
  // index = 0,
  setAction,
  endpoint,
  actions = [],
  setActivePanel,
  documentsMap,
  assistant_id: current_assistant_id,
  setCurrentAssistantId,
  assistantsConfig,
  version,
}: AssistantPanelProps & { assistantsConfig?: TConfig | null }) {
  const queryClient = useQueryClient();
  const modelsQuery = useGetModelsQuery();
  const assistantMap = useAssistantsMapContext();

  const allTools = queryClient.getQueryData<TPlugin[]>([QueryKeys.tools]) ?? [];
  const { onSelect: onSelectAssistant } = useSelectAssistant(endpoint);
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const methods = useForm<AssistantForm>({
    defaultValues: defaultAssistantFormValues,
  });

  const [showToolDialog, setShowToolDialog] = useState(false);

  const { control, handleSubmit, reset, setValue, getValues } = methods;
  const assistant = useWatch({ control, name: 'assistant' });
  const functions = useWatch({ control, name: 'functions' });
  const assistant_id = useWatch({ control, name: 'id' });

  const activeModel = useMemo(() => {
    return assistantMap?.[endpoint]?.[assistant_id]?.model;
  }, [assistantMap, endpoint, assistant_id]);

  const toolsEnabled = useMemo(
    () => assistantsConfig?.capabilities?.includes(Capabilities.tools),
    [assistantsConfig],
  );
  const actionsEnabled = useMemo(
    () => assistantsConfig?.capabilities?.includes(Capabilities.actions),
    [assistantsConfig],
  );
  const retrievalEnabled = useMemo(
    () => assistantsConfig?.capabilities?.includes(Capabilities.retrieval),
    [assistantsConfig],
  );
  const codeEnabled = useMemo(
    () => assistantsConfig?.capabilities?.includes(Capabilities.code_interpreter),
    [assistantsConfig],
  );

  /* Mutations */
  const update = useUpdateAssistantMutation({
    onSuccess: (data) => {
      showToast({
        message: `${localize('com_assistants_update_success')} ${
          data.name ?? localize('com_ui_assistant')
        }`,
      });
    },
    onError: (err) => {
      const error = err as Error;
      showToast({
        message: `${localize('com_assistants_update_error')}${
          error.message ? ` ${localize('com_ui_error')}: ${error.message}` : ''
        }`,
        status: 'error',
      });
    },
  });

  const create = useCreateAssistantMutation({
    onSuccess: (data) => {
      setCurrentAssistantId(data.id);
      showToast({
        message: `${localize('com_assistants_create_success')} ${
          data.name ?? localize('com_ui_assistant')
        }`,
      });
    },
    onError: (err) => {
      const error = err as Error;
      showToast({
        message: `${localize('com_assistants_create_error')}${
          error.message ? ` ${localize('com_ui_error')}: ${error.message}` : ''
        }`,
        status: 'error',
      });
    },
  });

  const files = useMemo(() => {
    if (typeof assistant === 'string') {
      return [];
    }
    return assistant.files;
  }, [assistant]);

  const onSubmit = (data: AssistantForm) => {
    const tools: Array<FunctionTool | string> = [...functions].map((functionName) => {
      if (!functionName.includes(actionDelimiter)) {
        return functionName;
      } else {
        const assistant = assistantMap?.[endpoint]?.[assistant_id];
        const tool = assistant?.tools?.find((tool) => tool.function?.name === functionName);
        if (assistant && tool) {
          return tool;
        }
      }

      return functionName;
    });

    if (data.code_interpreter) {
      tools.push({ type: Tools.code_interpreter });
    }
    if (data.retrieval) {
      tools.push({ type: version == 2 ? Tools.file_search : Tools.retrieval });
    }
    if (data.image_vision) {
      tools.push(ImageVisionTool);
    }

    const {
      name,
      description,
      instructions,
      conversation_starters: starters,
      model,
      append_current_datetime,
    } = data;

    if (assistant_id) {
      update.mutate({
        assistant_id,
        data: {
          name,
          description,
          instructions,
          conversation_starters: starters.filter((starter) => starter.trim() !== ''),
          model,
          tools,
          endpoint,
          append_current_datetime,
        },
      });
      return;
    }

    create.mutate({
      name,
      description,
      instructions,
      conversation_starters: starters.filter((starter) => starter.trim() !== ''),
      model,
      tools,
      endpoint,
      version,
      append_current_datetime,
    });
  };

  let submitContext: string | JSX.Element;

  if (create.isLoading || update.isLoading) {
    submitContext = <Spinner className="icon-md" />;
  } else if (assistant_id) {
    submitContext = localize('com_ui_save');
  } else {
    submitContext = localize('com_ui_create');
  }

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="h-auto w-full flex-shrink-0 overflow-x-hidden"
      >
        <div className="flex w-full flex-wrap">
          <Controller
            name="assistant"
            control={control}
            render={({ field }) => (
              <AssistantSelect
                reset={reset}
                value={field.value}
                endpoint={endpoint}
                documentsMap={documentsMap}
                setCurrentAssistantId={setCurrentAssistantId}
                selectedAssistant={current_assistant_id ?? null}
                createMutation={create}
              />
            )}
          />
          {/* Select Button */}
          {assistant_id && (
            <button
              className="btn btn-primary focus:shadow-outline mx-2 mt-1 h-[40px] rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0"
              type="button"
              disabled={!assistant_id}
              onClick={(e) => {
                e.preventDefault();
                onSelectAssistant(assistant_id);
              }}
            >
              {localize('com_ui_select')}
            </button>
          )}
        </div>
        <div className="bg-surface-50 h-auto px-4 pb-8 pt-3 dark:bg-transparent">
          {/* Avatar & Name */}
          <div className="mb-4">
            <AssistantAvatar
              createMutation={create}
              assistant_id={assistant_id}
              metadata={assistant['metadata'] ?? null}
              endpoint={endpoint}
              version={version}
            />
            <label className={labelClass} htmlFor="name">
              {localize('com_ui_name')}
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
                  placeholder={localize('com_assistants_name_placeholder')}
                />
              )}
            />
            <Controller
              name="id"
              control={control}
              render={({ field }) => (
                <p className="h-3 text-xs italic text-text-secondary">{field.value}</p>
              )}
            />
          </div>
          {/* Description */}
          <div className="mb-4">
            <label className={labelClass} htmlFor="description">
              {localize('com_ui_description')}
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
                  placeholder={localize('com_assistants_description_placeholder')}
                />
              )}
            />
          </div>

          {/* Instructions */}
          <div className="mb-6">
            <label className={labelClass} htmlFor="instructions">
              {localize('com_ui_instructions')}
            </label>
            <Controller
              name="instructions"
              control={control}
              render={({ field }) => (
                <textarea
                  {...field}
                  value={field.value ?? ''}
                  {...{ max: 32768 }}
                  className={cn(inputClass, 'min-h-[100px] resize-y')}
                  id="instructions"
                  placeholder={localize('com_assistants_instructions_placeholder')}
                  rows={3}
                />
              )}
            />
          </div>

          {/* Append Today's Date */}
          <AppendDateCheckbox control={control} setValue={setValue} getValues={getValues} />

          {/* Conversation Starters */}
          <div className="relative mb-6">
            {/* the label of conversation starters is in the component */}
            <Controller
              name="conversation_starters"
              control={control}
              defaultValue={[]}
              render={({ field }) => (
                <AssistantConversationStarters
                  field={field}
                  inputClass={inputClass}
                  labelClass={labelClass}
                />
              )}
            />
          </div>
          {/* Model */}
          <div className="mb-6">
            <label className={labelClass} htmlFor="model">
              {localize('com_ui_model')}
            </label>
            <Controller
              name="model"
              control={control}
              rules={{ required: true, minLength: 1 }}
              render={({ field, fieldState: { error } }) => (
                <>
                  <SelectDropDown
                    emptyTitle={true}
                    value={field.value}
                    setValue={field.onChange}
                    availableValues={modelsQuery.data?.[endpoint] ?? []}
                    showAbove={false}
                    showLabel={false}
                    className={cn(
                      cardStyle,
                      'flex h-[40px] w-full flex-none items-center justify-center px-4 hover:cursor-pointer',
                    )}
                    containerClassName={cn('rounded-md', error ? 'border-red-500 border-2' : '')}
                  />
                  {error && (
                    <span className="text-sm text-red-500 transition duration-300 ease-in-out">
                      {localize('com_ui_field_required')}
                    </span>
                  )}
                </>
              )}
            />
          </div>
          {/* Knowledge */}
          {(codeEnabled === true || retrievalEnabled === true) && version == 1 && (
            <Knowledge assistant_id={assistant_id} files={files} endpoint={endpoint} />
          )}
          {/* Capabilities */}
          <CapabilitiesForm
            version={version}
            endpoint={endpoint}
            codeEnabled={codeEnabled}
            assistantsConfig={assistantsConfig}
            retrievalEnabled={retrievalEnabled}
          />
          {/* Tools */}
          <div className="mb-6">
            <label className={labelClass}>
              {`${toolsEnabled === true ? localize('com_ui_tools') : ''}
              ${toolsEnabled === true && actionsEnabled === true ? ' + ' : ''}
              ${actionsEnabled === true ? localize('com_assistants_actions') : ''}`}
            </label>
            <div className="space-y-2">
              {functions.map((func, i) => (
                <AssistantTool
                  key={`${func}-${i}-${assistant_id}`}
                  tool={func}
                  allTools={allTools}
                  assistant_id={assistant_id}
                />
              ))}
              {actions
                .filter((action) => action.assistant_id === assistant_id)
                .map((action, i) => {
                  return <Action key={i} action={action} onClick={() => setAction(action)} />;
                })}
              <div className="flex space-x-2">
                {toolsEnabled === true && (
                  <button
                    type="button"
                    onClick={() => setShowToolDialog(true)}
                    className="btn btn-neutral border-token-border-light relative h-8 w-full rounded-lg font-medium"
                  >
                    <div className="flex w-full items-center justify-center gap-2">
                      {localize('com_assistants_add_tools')}
                    </div>
                  </button>
                )}
                {actionsEnabled === true && (
                  <button
                    type="button"
                    disabled={!assistant_id}
                    onClick={() => {
                      if (!assistant_id) {
                        return showToast({
                          message: localize('com_assistants_actions_disabled'),
                          status: 'warning',
                        });
                      }
                      setActivePanel(Panel.actions);
                    }}
                    className="btn btn-neutral border-token-border-light relative h-8 w-full rounded-lg font-medium"
                  >
                    <div className="flex w-full items-center justify-center gap-2">
                      {localize('com_assistants_add_actions')}
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            {/* Context Button */}
            <ContextButton
              assistant_id={assistant_id}
              activeModel={activeModel}
              setCurrentAssistantId={setCurrentAssistantId}
              createMutation={create}
              endpoint={endpoint}
            />
            {/* Submit Button */}
            <button
              className="btn btn-primary focus:shadow-outline flex w-full items-center justify-center px-4 py-2 font-semibold text-white hover:bg-green-600 focus:border-green-500"
              type="submit"
            >
              {submitContext}
            </button>
          </div>
        </div>
        <ToolSelectDialog
          isOpen={showToolDialog}
          setIsOpen={setShowToolDialog}
          toolsFormKey="functions"
          endpoint={endpoint}
        />
      </form>
    </FormProvider>
  );
}
