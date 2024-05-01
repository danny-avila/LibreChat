import { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import type { AssistantPanelProps, ActionAuthForm } from '~/common';
import { useAssistantsMapContext, useToastContext } from '~/Providers';
import { Dialog, DialogTrigger } from '~/components/ui';
import { useDeleteAction } from '~/data-provider';
import { TrashIcon, GearIcon } from '~/components/svg';
import useLocalize from '~/hooks/useLocalize';
import ActionsInput from './ActionsInput';
import ActionsAuth from './ActionsAuth';
import { Panel } from '~/common';

export default function ActionsPanel({
  // activePanel,
  action,
  setAction,
  setActivePanel,
  assistant_id,
}: AssistantPanelProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const assistantMap = useAssistantsMapContext();
  const [openAuthDialog, setOpenAuthDialog] = useState(false);
  const deleteAction = useDeleteAction({
    onSuccess: () => {
      showToast({
        message: localize('com_assistants_delete_actions_success'),
        status: 'success',
      });
      setActivePanel(Panel.builder);
      setAction(undefined);
    },
    onError(error) {
      showToast({
        message: (error as Error)?.message ?? localize('com_assistants_delete_actions_error'),
        status: 'error',
      });
    },
  });

  const methods = useForm<ActionAuthForm>({
    defaultValues: {
      /* General */
      type: AuthTypeEnum.None,
      saved_auth_fields: false,
      /* API key */
      api_key: '',
      authorization_type: AuthorizationTypeEnum.Basic,
      custom_auth_header: '',
      /* OAuth */
      oauth_client_id: '',
      oauth_client_secret: '',
      authorization_url: '',
      client_url: '',
      scope: '',
      token_exchange_method: TokenExchangeMethodEnum.DefaultPost,
    },
  });

  const { reset, watch } = methods;
  const type = watch('type');

  useEffect(() => {
    if (action?.metadata?.auth) {
      reset({
        type: action.metadata.auth.type || AuthTypeEnum.None,
        saved_auth_fields: false,
        api_key: action.metadata.api_key ?? '',
        authorization_type: action.metadata.auth.authorization_type || AuthorizationTypeEnum.Basic,
        oauth_client_id: action.metadata.oauth_client_id ?? '',
        oauth_client_secret: action.metadata.oauth_client_secret ?? '',
        authorization_url: action.metadata.auth.authorization_url ?? '',
        client_url: action.metadata.auth.client_url ?? '',
        scope: action.metadata.auth.scope ?? '',
        token_exchange_method:
          action.metadata.auth.token_exchange_method ?? TokenExchangeMethodEnum.DefaultPost,
      });
    }
  }, [action, reset]);

  return (
    <FormProvider {...methods}>
      <form className="h-full grow overflow-hidden">
        <div className="h-full overflow-auto px-2 pb-12 text-sm">
          <div className="relative flex flex-col items-center px-16 py-6 text-center">
            <div className="absolute left-0 top-6">
              <button
                type="button"
                className="btn btn-neutral relative"
                onClick={() => {
                  setActivePanel(Panel.builder);
                  setAction(undefined);
                }}
              >
                <div className="flex w-full items-center justify-center gap-2">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="icon-md"
                  >
                    <path
                      d="M15 5L8 12L15 19"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                  </svg>
                </div>
              </button>
            </div>
            {!!action && (
              <div className="absolute right-0 top-6">
                <button
                  type="button"
                  disabled={!assistant_id || !action.action_id}
                  className="btn relative bg-transparent text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => {
                    if (!assistant_id) {
                      return prompt('No assistant_id found, is the assistant created?');
                    }
                    const confirmed = confirm('Are you sure you want to delete this action?');
                    if (confirmed) {
                      deleteAction.mutate({
                        model: assistantMap[assistant_id].model,
                        action_id: action.action_id,
                        assistant_id,
                      });
                    }
                  }}
                >
                  <div className="flex w-full items-center justify-center gap-2">
                    <TrashIcon className="icon-md text-red-500" />
                  </div>
                </button>
              </div>
            )}
            <div className="text-xl font-medium">{(action ? 'Edit' : 'Add') + ' ' + 'actions'}</div>
            <div className="text-token-text-tertiary text-sm">
              {localize('com_assistants_actions_info')}
            </div>
            {/* <div className="text-sm text-token-text-tertiary">
            <a href="https://help.openai.com/en/articles/8554397-creating-a-gpt" target="_blank" rel="noreferrer" className="font-medium">Learn more.</a>
          </div> */}
          </div>
          <Dialog open={openAuthDialog} onOpenChange={setOpenAuthDialog}>
            <DialogTrigger asChild>
              <div className="relative mb-6">
                <div className="mb-1.5 flex items-center">
                  <label className="text-token-text-primary block font-medium">
                    {localize('com_ui_authentication')}
                  </label>
                </div>
                <div className="border-token-border-medium hover:cursor-pointe flex rounded-lg border text-sm">
                  <div className="h-9 grow px-3 py-2">{type}</div>
                  <div className="bg-token-border-medium w-px"></div>
                  <button type="button" color="neutral" className="flex items-center gap-2 px-3">
                    <GearIcon className="icon-sm" />
                  </button>
                </div>
              </div>
            </DialogTrigger>
            <ActionsAuth setOpenAuthDialog={setOpenAuthDialog} />
          </Dialog>
          <ActionsInput action={action} assistant_id={assistant_id} setAction={setAction} />
        </div>
      </form>
    </FormProvider>
  );
}
