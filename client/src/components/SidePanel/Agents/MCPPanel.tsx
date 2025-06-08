import { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import { ChevronLeft } from 'lucide-react';
import type { AgentPanelProps, MCPAuthForm } from '~/common';

import { OGDialog, OGDialogTrigger, Label } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import useLocalize from '~/hooks/useLocalize';
import { useToastContext } from '~/Providers';
import { TrashIcon } from '~/components/svg';
import MCPInput from './MCPInput';
import MCPTools from './MCPTools';
import { Panel } from '~/common';
import MCPAuth from './MCPAuth';

// Mock tools that would come from MCP response
const mockMCPTools = [
  'get_weather',
  'get_stock_price',
  'get_news_headlines',
  'create_calendar_event',
  'send_email',
  'get_user_profile',
  'update_user_settings',
  'get_system_status',
  'get_api_usage',
  'get_error_logs'
];

export default function MCPPanel({
  mcp,
  mcps,
  setActivePanel,
}: AgentPanelProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  const methods = useForm<MCPAuthForm>({
    defaultValues: {
      type: AuthTypeEnum.None,
      saved_auth_fields: false,
      api_key: '',
      authorization_type: AuthorizationTypeEnum.Bearer,
      custom_auth_header: '',
      oauth_client_id: '',
      oauth_client_secret: '',
      authorization_url: '',
      client_url: '',
      scope: '',
      token_exchange_method: TokenExchangeMethodEnum.DefaultPost,
      url: '',
      label: '',
    },
  });

  const { reset } = methods;

  useEffect(() => {
    if (mcp?.formData) {
      reset(mcp.formData);
    }
  }, [mcp, reset]);

  const onSubmit = (data: MCPAuthForm) => {
    console.log('Form submitted:', data);
    console.log('Selected tools:', selectedTools);
    reset();
    setActivePanel(Panel.builder);
    showToast({
      message: localize('com_assistants_mcp_server_added'),
      status: 'success',
    });
  };

  const handleToolToggle = (toolName: string) => {
    setSelectedTools(prev => 
      prev.includes(toolName) 
        ? prev.filter(t => t !== toolName)
        : [...prev, toolName]
    );
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

          <MCPAuth />
          <MCPInput mcp={mcp} />
          <MCPTools selectedTools={selectedTools} onToolToggle={handleToolToggle} />

          <div className="mt-4 flex items-center justify-end">
            <button
              onClick={methods.handleSubmit(onSubmit)}
              className="focus:shadow-outline mt-1 flex min-w-[100px] items-center justify-center rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0"
              type="button"
            >
              {mcp ? localize('com_ui_update') : localize('com_ui_create')}
            </button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
} 