import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import { ChevronLeft } from 'lucide-react';
import type { AgentPanelProps, ActionAuthForm } from '~/common';
import ActionsAuth from '~/components/SidePanel/Builder/ActionsAuth';
import { OGDialog, OGDialogTrigger, Label } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import useLocalize from '~/hooks/useLocalize';
import { useToastContext } from '~/Providers';
import MCPInput from './MCPInput';

export default function MCPPanel({
  setActivePanel,
  agent_id,
}: AgentPanelProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

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

  const { reset } = methods;

  const onSubmit = (data: ActionAuthForm) => {
    console.log('MCP form data:', data);
    // TODO: Implement MCP creation/update
    reset();
    setActivePanel('builder');
    showToast({
      message: localize('com_assistants_mcp_server_added'),
      status: 'success',
    });
  };

  return (
    <FormProvider {...methods}>
      <form className="h-full grow overflow-hidden" onSubmit={methods.handleSubmit(onSubmit)}>
        <div className="h-full overflow-auto px-2 pb-12 text-sm">
          <div className="relative flex flex-col items-center px-16 py-6 text-center">
            <div className="absolute left-0 top-6">
              <button
                type="button"
                className="btn btn-neutral relative"
                onClick={() => {
                  setActivePanel(Panel.builder);
                }}
              >
                <div className="flex w-full items-center justify-center gap-2">
                  <ChevronLeft />
                </div>
              </button>
            </div>

            <div className="text-xl font-medium">{localize('com_assistants_add_mcp_server')}</div>
            <div className="text-xs text-text-secondary">
              {localize('com_assistants_mcp_server_info')}
            </div>
          </div>
          <ActionsAuth />
          <MCPInput />
        </div>
      </form>
    </FormProvider>
  );
} 