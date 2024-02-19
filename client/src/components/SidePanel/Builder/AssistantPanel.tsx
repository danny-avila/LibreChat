import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { useForm, FormProvider, Controller, useWatch } from 'react-hook-form';
import {
  Tools,
  QueryKeys,
  EModelEndpoint,
  actionDelimiter,
  supportsRetrieval,
  defaultAssistantFormValues,
} from 'librechat-data-provider';
import type { FunctionTool, TPlugin } from 'librechat-data-provider';
import type { AssistantForm, AssistantPanelProps } from '~/common';
import { useCreateAssistantMutation, useUpdateAssistantMutation } from '~/data-provider';
import { SelectDropDown, Checkbox, QuestionMark } from '~/components/ui';
import { useAssistantsMapContext, useToastContext } from '~/Providers';
import { useSelectAssistant, useLocalize } from '~/hooks';
import { ToolSelectDialog } from '~/components/Tools';
import AssistantAvatar from './AssistantAvatar';
import AssistantSelect from './AssistantSelect';
import AssistantAction from './AssistantAction';
import ContextButton from './ContextButton';
import AssistantTool from './AssistantTool';
import { Spinner } from '~/components/svg';
import { cn, cardStyle } from '~/utils/';
import Knowledge from './Knowledge';
import { Panel } from '~/common';

const labelClass = 'mb-2 block text-xs font-bold text-gray-700 dark:text-gray-400';
const inputClass =
  'focus:shadow-outline w-full appearance-none rounded-md border px-3 py-2 text-sm leading-tight text-gray-700 dark:text-white shadow focus:border-green-500 focus:outline-none focus:ring-0 dark:bg-gray-800 dark:border-gray-700/80';

export default function AssistantPanel({
  // index = 0,
  setAction,
  actions = [],
  setActivePanel,
  assistant_id: current_assistant_id,
  setCurrentAssistantId,
}: AssistantPanelProps) {
  const queryClient = useQueryClient();
  const modelsQuery = useGetModelsQuery();
  const assistantMap = useAssistantsMapContext();
  const [showToolDialog, setShowToolDialog] = useState(false);
  const allTools = queryClient.getQueryData<TPlugin[]>([QueryKeys.tools]) ?? [];
  const { onSelect: onSelectAssistant } = useSelectAssistant();
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const methods = useForm<AssistantForm>({
    defaultValues: defaultAssistantFormValues,
  });
  const { control, handleSubmit, reset, setValue, getValues } = methods;
  const assistant_id = useWatch({ control, name: 'id' });
  const assistant = useWatch({ control, name: 'assistant' });
  const functions = useWatch({ control, name: 'functions' });
  const model = useWatch({ control, name: 'model' });

  useEffect(() => {
    if (model && !supportsRetrieval.has(model)) {
      setValue('retrieval', false);
    }
  }, [model, setValue]);

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
          error?.message ? ` ${localize('com_ui_error')}: ${error?.message}` : ''
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
          error?.message ? ` ${localize('com_ui_error')}: ${error?.message}` : ''
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
        const assistant = assistantMap?.[assistant_id];
        const tool = assistant?.tools?.find((tool) => tool.function?.name === functionName);
        if (assistant && tool) {
          return tool;
        }
      }

      return functionName;
    });

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
        <div className="h-auto bg-white px-4 pb-8 pt-3 dark:bg-transparent">
          {/* Avatar & Name */}
          <div className="mb-4">
            <AssistantAvatar
              createMutation={create}
              assistant_id={assistant_id ?? null}
              metadata={assistant?.['metadata'] ?? null}
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
                <p className="h-3 text-xs italic text-gray-600">{field.value ?? ''}</p>
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
                  className="focus:shadow-outline min-h-[150px] w-full resize-none resize-y appearance-none rounded-md border px-3 py-2 text-sm leading-tight text-gray-700 shadow focus:border-green-500 focus:outline-none focus:ring-0 dark:border-gray-700/80 dark:bg-gray-800 dark:text-white"
                  id="instructions"
                  placeholder={localize('com_assistants_instructions_placeholder')}
                  rows={3}
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
              render={({ field }) => (
                <SelectDropDown
                  emptyTitle={true}
                  value={field.value}
                  setValue={field.onChange}
                  availableValues={modelsQuery.data?.[EModelEndpoint.assistants] ?? []}
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
          {/* Knowledge */}
          <Knowledge assistant_id={assistant_id} files={files} />
          {/* Capabilities */}
          <div className="mb-6">
            <div className="mb-1.5 flex items-center">
              <span>
                <label className="text-token-text-primary block font-medium">Capabilities</label>
              </span>
            </div>
            <div className="flex flex-col items-start gap-2">
              <div className="flex items-center">
                <Controller
                  name={'code_interpreter'}
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      {...field}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="relative float-left  mr-2 inline-flex h-4 w-4 cursor-pointer"
                      value={field?.value?.toString()}
                    />
                  )}
                />
                <label
                  className="form-check-label text-token-text-primary w-full cursor-pointer"
                  htmlFor="code_interpreter"
                  onClick={() =>
                    setValue('code_interpreter', !getValues('code_interpreter'), {
                      shouldDirty: true,
                    })
                  }
                >
                  <div className="flex items-center">
                    {localize('com_assistants_code_interpreter')}
                    <QuestionMark />
                  </div>
                </label>
              </div>
              <div className="flex items-center">
                <Controller
                  name={'retrieval'}
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      {...field}
                      checked={field.value}
                      disabled={!supportsRetrieval.has(model)}
                      onCheckedChange={field.onChange}
                      className="relative float-left  mr-2 inline-flex h-4 w-4 cursor-pointer"
                      value={field?.value?.toString()}
                    />
                  )}
                />
                <label
                  className={cn(
                    'form-check-label text-token-text-primary w-full',
                    !supportsRetrieval.has(model) ? 'cursor-no-drop opacity-50' : 'cursor-pointer',
                  )}
                  htmlFor="retrieval"
                  onClick={() =>
                    supportsRetrieval.has(model) &&
                    setValue('retrieval', !getValues('retrieval'), { shouldDirty: true })
                  }
                >
                  {localize('com_assistants_retrieval')}
                </label>
              </div>
            </div>
          </div>
          {/* Tools */}
          <div className="mb-6">
            <label className={labelClass}>{localize('com_assistants_tools_section')}</label>
            <div className="space-y-1">
              {functions.map((func) => (
                <AssistantTool
                  key={func}
                  tool={func}
                  allTools={allTools}
                  assistant_id={assistant_id}
                />
              ))}
              {actions
                .filter((action) => action.assistant_id === assistant_id)
                .map((action, i) => {
                  return (
                    <AssistantAction key={i} action={action} onClick={() => setAction(action)} />
                  );
                })}
              <button
                type="button"
                onClick={() => setShowToolDialog(true)}
                className="btn btn-neutral border-token-border-light relative mx-1 mt-2 h-8 rounded-lg font-medium"
              >
                <div className="flex w-full items-center justify-center gap-2">
                  {localize('com_assistants_add_tools')}
                </div>
              </button>
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
                className="btn btn-neutral border-token-border-light relative mt-2 h-8 rounded-lg font-medium"
              >
                <div className="flex w-full items-center justify-center gap-2">
                  {localize('com_assistants_add_actions')}
                </div>
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            {/* Context Button */}
            <ContextButton
              assistant_id={assistant_id}
              setCurrentAssistantId={setCurrentAssistantId}
              createMutation={create}
            />
            {/* Secondary Select Button */}
            {assistant_id && (
              <button
                className="btn btn-secondary"
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
            {/* Submit Button */}
            <button
              className="btn btn-primary focus:shadow-outline flex w-[90px] items-center justify-center px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500"
              type="submit"
            >
              {create.isLoading || update.isLoading ? (
                <Spinner className="icon-md" />
              ) : assistant_id ? (
                localize('com_ui_save')
              ) : (
                localize('com_ui_create')
              )}
            </button>
          </div>
        </div>
        <ToolSelectDialog
          isOpen={showToolDialog}
          setIsOpen={setShowToolDialog}
          assistant_id={assistant_id}
        />
      </form>
    </FormProvider>
  );
}
