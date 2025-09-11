import { useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogTrigger,
  Label,
  OGDialogTemplate,
  TrashIcon,
  useToastContext,
} from '@librechat/client';
import { useAgentPanelContext } from '~/Providers/AgentPanelContext';
import { defaultMCPFormValues } from '~/common/mcp';
import type { MCPForm } from '~/common';
import { useLocalize } from '~/hooks';
import MCPInput from './MCPInput';
import { Panel } from '~/common';
// TODO: Add MCP delete (for now mocked for ui)
// import { useDeleteAgentMCP } from '~/data-provider';

function useDeleteAgentMCP({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (error: Error) => void;
}) {
  return {
    mutate: async ({ mcp_id, agent_id }: { mcp_id: string; agent_id: string }) => {
      try {
        console.log('Mock delete MCP:', { mcp_id, agent_id });
        onSuccess();
      } catch (error) {
        onError(error as Error);
      }
    },
  };
}

export default function MCPPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { mcp, setMcp, agent_id, setActivePanel } = useAgentPanelContext();
  const deleteAgentMCP = useDeleteAgentMCP({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_delete_mcp_success'),
        status: 'success',
      });
      setActivePanel(Panel.builder);
      setMcp(undefined);
    },
    onError(error) {
      showToast({
        message: (error as Error).message ?? localize('com_ui_delete_mcp_error'),
        status: 'error',
      });
    },
  });

  const methods = useForm<MCPForm>({
    defaultValues: defaultMCPFormValues,
    mode: 'onChange',
  });

  const { reset } = methods;

  useEffect(() => {
    if (mcp) {
      const formData = {
        icon: mcp.metadata.icon ?? '',
        name: mcp.metadata.name ?? '',
        description: mcp.metadata.description ?? '',
        url: mcp.metadata.url ?? '',
        tools: mcp.metadata.tools ?? [],
        trust: mcp.metadata.trust ?? false,
      };

      if (mcp.metadata.auth) {
        Object.assign(formData, {
          type: mcp.metadata.auth.type || AuthTypeEnum.None,
          saved_auth_fields: false,
          api_key: mcp.metadata.api_key ?? '',
          authorization_type: mcp.metadata.auth.authorization_type || AuthorizationTypeEnum.Basic,
          oauth_client_id: mcp.metadata.oauth_client_id ?? '',
          oauth_client_secret: mcp.metadata.oauth_client_secret ?? '',
          authorization_url: mcp.metadata.auth.authorization_url ?? '',
          client_url: mcp.metadata.auth.client_url ?? '',
          scope: mcp.metadata.auth.scope ?? '',
          token_exchange_method:
            mcp.metadata.auth.token_exchange_method ?? TokenExchangeMethodEnum.DefaultPost,
        });
      }

      reset(formData);
    }
  }, [mcp, reset]);

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
                  setMcp(undefined);
                }}
              >
                <div className="flex w-full items-center justify-center gap-2">
                  <ChevronLeft />
                </div>
              </button>
            </div>

            {!!mcp && (
              <OGDialog>
                <OGDialogTrigger asChild>
                  <div className="absolute right-0 top-6">
                    <button
                      type="button"
                      disabled={!agent_id || !mcp.mcp_id}
                      className="btn btn-neutral border-token-border-light relative h-9 rounded-lg font-medium"
                    >
                      <TrashIcon className="text-red-500" />
                    </button>
                  </div>
                </OGDialogTrigger>
                <OGDialogTemplate
                  showCloseButton={false}
                  title={localize('com_ui_delete_mcp')}
                  className="max-w-[450px]"
                  main={
                    <Label className="text-left text-sm font-medium">
                      {localize('com_ui_delete_mcp_confirm')}
                    </Label>
                  }
                  selection={{
                    selectHandler: () => {
                      if (!agent_id) {
                        return showToast({
                          message: localize('com_agents_no_agent_id_error'),
                          status: 'error',
                        });
                      }
                      deleteAgentMCP.mutate({
                        mcp_id: mcp.mcp_id,
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

            <div className="text-xl font-medium">
              {mcp ? localize('com_ui_edit_mcp_server') : localize('com_ui_add_mcp_server')}
            </div>
            <div className="text-xs text-text-secondary">{localize('com_agents_mcp_info')}</div>
          </div>
          <MCPInput mcp={mcp} agent_id={agent_id} setMCP={setMcp} />
        </div>
      </form>
    </FormProvider>
  );
}
