import { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import type { AssistantPanelProps, ActionAuthForm } from '~/common';
import { Dialog, DialogTrigger } from '~/components/ui';
import { useDeleteAction } from '~/data-provider';
import { NewTrashIcon } from '~/components/svg';
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
  const [openAuthDialog, setOpenAuthDialog] = useState(false);
  const deleteAction = useDeleteAction({
    onSuccess: () => {
      setActivePanel(Panel.builder);
      setAction(undefined);
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
                        action_id: action.action_id,
                        assistant_id,
                      });
                    }
                  }}
                >
                  <div className="flex w-full items-center justify-center gap-2">
                    <NewTrashIcon className="icon-md text-red-500" />
                  </div>
                </button>
              </div>
            )}
            <div className="text-xl font-medium">{(action ? 'Edit' : 'Add') + ' ' + 'actions'}</div>
            <div className="text-token-text-tertiary text-sm">
              {/* TODO: use App title */}
              Let your Assistant retrieve information or take actions outside of LibreChat.
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
                    Authentication
                  </label>
                </div>
                <div className="border-token-border-medium flex rounded-lg border text-sm hover:cursor-pointer">
                  <div className="h-9 grow px-3 py-2">{type}</div>
                  <div className="bg-token-border-medium w-px"></div>
                  <button type="button" color="neutral" className="flex items-center gap-2 px-3">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="icon-sm"
                    >
                      <path
                        d="M11.6439 3C10.9352 3 10.2794 3.37508 9.92002 3.98596L9.49644 4.70605C8.96184 5.61487 7.98938 6.17632 6.93501 6.18489L6.09967 6.19168C5.39096 6.19744 4.73823 6.57783 4.38386 7.19161L4.02776 7.80841C3.67339 8.42219 3.67032 9.17767 4.01969 9.7943L4.43151 10.5212C4.95127 11.4386 4.95127 12.5615 4.43151 13.4788L4.01969 14.2057C3.67032 14.8224 3.67339 15.5778 4.02776 16.1916L4.38386 16.8084C4.73823 17.4222 5.39096 17.8026 6.09966 17.8083L6.93502 17.8151C7.98939 17.8237 8.96185 18.3851 9.49645 19.294L9.92002 20.014C10.2794 20.6249 10.9352 21 11.6439 21H12.3561C13.0648 21 13.7206 20.6249 14.08 20.014L14.5035 19.294C15.0381 18.3851 16.0106 17.8237 17.065 17.8151L17.9004 17.8083C18.6091 17.8026 19.2618 17.4222 19.6162 16.8084L19.9723 16.1916C20.3267 15.5778 20.3298 14.8224 19.9804 14.2057L19.5686 13.4788C19.0488 12.5615 19.0488 11.4386 19.5686 10.5212L19.9804 9.7943C20.3298 9.17767 20.3267 8.42219 19.9723 7.80841L19.6162 7.19161C19.2618 6.57783 18.6091 6.19744 17.9004 6.19168L17.065 6.18489C16.0106 6.17632 15.0382 5.61487 14.5036 4.70605L14.08 3.98596C13.7206 3.37508 13.0648 3 12.3561 3H11.6439Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
                    </svg>
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
