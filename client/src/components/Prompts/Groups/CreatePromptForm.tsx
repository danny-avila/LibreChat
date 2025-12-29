import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, TextareaAutosize, Input } from '@librechat/client';
import { useForm, Controller, FormProvider } from 'react-hook-form';
import { LocalStorageKeys, PermissionTypes, Permissions } from 'librechat-data-provider';
import CategorySelector from '~/components/Prompts/Groups/CategorySelector';
import VariablesDropdown from '~/components/Prompts/VariablesDropdown';
import PromptVariables from '~/components/Prompts/PromptVariables';
import Description from '~/components/Prompts/Description';
import { usePromptGroupsContext } from '~/Providers';
import { useLocalize, useHasAccess } from '~/hooks';
import Command from '~/components/Prompts/Command';
import { useCreatePrompt } from '~/data-provider';
import { cn } from '~/utils';

type CreateFormValues = {
  name: string;
  prompt: string;
  type: 'text' | 'chat';
  category: string;
  oneliner?: string;
  command?: string;
};

const defaultPrompt: CreateFormValues = {
  name: '',
  prompt: '',
  type: 'text',
  category: '',
  oneliner: undefined,
  command: undefined,
};

const CreatePromptForm = ({
  defaultValues = defaultPrompt,
}: {
  defaultValues?: CreateFormValues;
}) => {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { hasAccess: hasUseAccess } = usePromptGroupsContext();
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.CREATE,
  });
  const hasAccess = hasUseAccess && hasCreateAccess;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (!hasAccess) {
      timeoutId = setTimeout(() => {
        navigate('/c/new');
      }, 1000);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [hasAccess, navigate]);

  const methods = useForm({
    defaultValues: {
      ...defaultValues,
      category: localStorage.getItem(LocalStorageKeys.LAST_PROMPT_CATEGORY) ?? '',
    },
  });

  const {
    watch,
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting, errors, isValid },
  } = methods;

  const createPromptMutation = useCreatePrompt({
    onSuccess: (response) => {
      navigate(`/d/prompts/${response.prompt.groupId}`, { replace: true });
    },
  });

  const promptText = watch('prompt');

  const onSubmit = (data: CreateFormValues) => {
    const { name, category, oneliner, command, ...rest } = data;
    const groupData = { name, category } as Pick<
      CreateFormValues,
      'name' | 'category' | 'oneliner' | 'command'
    >;
    if ((oneliner?.length ?? 0) > 0) {
      groupData.oneliner = oneliner;
    }
    if ((command?.length ?? 0) > 0) {
      groupData.command = command;
    }
    createPromptMutation.mutate({
      prompt: rest,
      group: groupData,
    });
  };

  if (!hasAccess) {
    return null;
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="w-full px-4 py-2">
        <h1 className="sr-only">{localize('com_ui_create_prompt_page')}</h1>
        <div className="mb-1 flex flex-col items-center justify-between font-bold sm:text-xl md:mb-0 md:text-2xl">
          <div className="flex w-full flex-col items-center justify-between sm:flex-row">
            <Controller
              name="name"
              control={control}
              rules={{ required: localize('com_ui_prompt_name_required') }}
              render={({ field }) => (
                <div className="relative mb-1 flex flex-col md:mb-0">
                  <Input
                    {...field}
                    id="prompt-name"
                    type="text"
                    className="peer mr-2 w-full border border-border-medium p-2 text-2xl text-text-primary"
                    placeholder=" "
                    tabIndex={0}
                    aria-label={localize('com_ui_prompt_name')}
                  />
                  <label
                    htmlFor="prompt-name"
                    className="pointer-events-none absolute -top-1 left-3 origin-[0] translate-y-3 scale-100 rounded bg-white px-1 text-base text-text-secondary transition-transform duration-200 peer-placeholder-shown:translate-y-3 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2 peer-focus:scale-75 peer-focus:text-text-primary peer-[:not(:placeholder-shown)]:-translate-y-2 peer-[:not(:placeholder-shown)]:scale-75 dark:bg-gray-850"
                  >
                    {localize('com_ui_prompt_name')}*
                  </label>
                  <div
                    className={cn(
                      'mt-1 w-56 text-sm text-red-500',
                      errors.name ? 'visible h-auto' : 'invisible h-0',
                    )}
                  >
                    {errors.name ? errors.name.message : ' '}
                  </div>
                </div>
              )}
            />
            <CategorySelector />
          </div>
        </div>
        <div className="flex w-full flex-col gap-4 md:mt-[1.075rem]">
          <div>
            <h2 className="flex items-center justify-between rounded-t-lg border border-border-medium py-2 pl-4 pr-1 text-base font-semibold dark:text-gray-200">
              <span>{localize('com_ui_prompt_text')}*</span>
              <VariablesDropdown fieldName="prompt" className="mr-2" />
            </h2>
            <div className="min-h-32 rounded-b-lg border border-border-medium p-4 transition-all duration-150">
              <Controller
                name="prompt"
                control={control}
                rules={{ required: localize('com_ui_prompt_text_required') }}
                render={({ field }) => (
                  <div>
                    <TextareaAutosize
                      {...field}
                      className="w-full rounded border border-border-medium px-2 py-1 focus:outline-none dark:bg-transparent dark:text-gray-200"
                      minRows={6}
                      tabIndex={0}
                      aria-label={localize('com_ui_prompt_input_field')}
                    />
                    <div
                      className={`mt-1 text-sm text-red-500 ${
                        errors.prompt ? 'visible h-auto' : 'invisible h-0'
                      }`}
                    >
                      {errors.prompt ? errors.prompt.message : ' '}
                    </div>
                  </div>
                )}
              />
            </div>
          </div>
          <PromptVariables promptText={promptText} />
          <Description
            onValueChange={(value) => methods.setValue('oneliner', value)}
            tabIndex={0}
          />
          <Command onValueChange={(value) => methods.setValue('command', value)} tabIndex={0} />
          <div className="mt-4 flex justify-end">
            <Button
              aria-label={localize('com_ui_create_prompt')}
              tabIndex={0}
              type="submit"
              disabled={!isDirty || isSubmitting || !isValid}
            >
              {localize('com_ui_create_prompt')}
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};

export default CreatePromptForm;
