import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
  OAuthFlowTypeEnum,
} from 'librechat-data-provider';
import { ChevronLeft } from 'lucide-react';
import type { AgentPanelProps, ActionAuthForm } from '~/common';
import ActionsAuth from '~/components/SidePanel/Builder/ActionsAuth';
import { OGDialog, OGDialogTrigger, Label } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useDeleteAgentAction } from '~/data-provider';
import useLocalize from '~/hooks/useLocalize';
import { useToastContext } from '~/Providers';
import { TrashIcon } from '~/components/svg';
import ActionsInput from './ActionsInput';
import { Panel } from '~/common';

export default function ActionsPanel({
  // activePanel,
  action,
  setAction,
  agent_id,
  setActivePanel,
}: AgentPanelProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const deleteAgentAction = useDeleteAgentAction({
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
        message: (error as Error).message ?? localize('com_assistants_delete_actions_error'),
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

  useEffect(() => {
    if (action?.metadata.auth) {
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
        oauth_flow:
          action.metadata.auth.oauth_flow ?? OAuthFlowTypeEnum.AuthorizationCodeFlow,
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
                  <ChevronLeft />
                </div>
              </button>
            </div>

            {!!action && (
              <OGDialog>
                <OGDialogTrigger asChild>
                  <div className="absolute right-0 top-6">
                    <button
                      type="button"
                      disabled={!agent_id || !action.action_id}
                      className="btn btn-neutral border-token-border-light relative h-9 rounded-lg font-medium"
                    >
                      <TrashIcon className="text-red-500" />
                    </button>
                  </div>
                </OGDialogTrigger>
                <OGDialogTemplate
                  showCloseButton={false}
                  title={localize('com_ui_delete_action')}
                  className="max-w-[450px]"
                  main={
                    <Label className="text-left text-sm font-medium">
                      {localize('com_ui_delete_action_confirm')}
                    </Label>
                  }
                  selection={{
                    selectHandler: () => {
                      if (!agent_id) {
                        return showToast({
                          message: 'No agent_id found, is the agent created?',
                          status: 'error',
                        });
                      }
                      deleteAgentAction.mutate({
                        action_id: action.action_id,
                        agent_id,
                      });
                    },
                    selectClasses:
                      'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
                    selectText: localize('com_ui_delete'),
                  }}
                />
              </OGDialog>
            )}

            <div className="text-xl font-medium">{(action ? 'Edit' : 'Add') + ' ' + 'actions'}</div>
            <div className="text-xs text-text-secondary">
              {localize('com_assistants_actions_info')}
            </div>
            {/* <div className="text-sm text-text-secondary">
            <a href="https://help.openai.com/en/articles/8554397-creating-a-gpt" target="_blank" rel="noreferrer" className="font-medium">Learn more.</a>
          </div> */}
          </div>
          <ActionsAuth />
          <ActionsInput action={action} agent_id={agent_id} setAction={setAction} />
        </div>
      </form>
    </FormProvider>
  );
}
