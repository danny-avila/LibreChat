import { useFormContext } from 'react-hook-form';
import { useToastContext } from '~/Providers';
import useLocalize from '~/hooks/useLocalize';
import { Spinner } from '~/components/svg';
import { Label } from '~/components/ui';
import { MCPAuthForm } from '~/common/types';
import { MCP } from 'librechat-data-provider/dist/types/types/assistants';

function useUpdateAgentMCP({ onSuccess, onError }: { onSuccess: (data: [string, MCP]) => void; onError: (error: Error) => void }) {
  return {
    mutate: async ({ mcp_id, metadata, agent_id }: { mcp_id?: string; metadata: MCP['metadata']; agent_id: string }) => {
      try {
        console.log('Mock update MCP:', { mcp_id, metadata, agent_id });
        // Simulate API call
        const mockMCP: MCP = {
          mcp_id: mcp_id ?? 'new-mcp-id',
          agent_id,
          metadata,
        };
        onSuccess(['success', mockMCP]);
      } catch (error) {
        onError(error as Error);
      }
    },
    isLoading: false,
  };
}

interface MCPInputProps {
  mcp?: MCP;
  agent_id?: string;
  setMCP: React.Dispatch<React.SetStateAction<MCP | undefined>>;
}

export default function MCPInput({ mcp, agent_id, setMCP }: MCPInputProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { handleSubmit, reset } = useFormContext<MCPAuthForm>();

  const updateAgentMCP = useUpdateAgentMCP({
    onSuccess(data) {
      showToast({
        message: localize('com_assistants_update_mcp_success'),
        status: 'success',
      });
      reset();
      setMCP(data[1]);
    },
    onError(error) {
      showToast({
        message: (error as Error).message || localize('com_assistants_update_mcp_error'),
        status: 'error',
      });
    },
  });

  const saveMCP = handleSubmit((authFormData) => {
    const currentAgentId = agent_id ?? '';
    if (!currentAgentId) {
      return;
    }

    let { metadata = {} } = mcp ?? {};
    const mcp_id = mcp?.mcp_id;
    metadata = {
      ...metadata,
      label: authFormData.label,
      domain: authFormData.domain,
      auth: {
        type: authFormData.type,
        authorization_type: authFormData.authorization_type,
        custom_auth_header: authFormData.custom_auth_header,
        authorization_url: authFormData.authorization_url,
        client_url: authFormData.client_url,
        scope: authFormData.scope,
        token_exchange_method: authFormData.token_exchange_method,
      },
      api_key: authFormData.api_key,
      oauth_client_id: authFormData.oauth_client_id,
      oauth_client_secret: authFormData.oauth_client_secret,
    };

    updateAgentMCP.mutate({
      mcp_id,
      metadata,
      agent_id: currentAgentId,
    });
  });

  const getButtonContent = () => {
    if (updateAgentMCP.isLoading) {
      return <Spinner className="icon-md" />;
    }

    if (mcp?.mcp_id != null && mcp.mcp_id) {
      return localize('com_ui_update');
    }

    return localize('com_ui_create');
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="label">{localize('com_assistants_mcp_label')}</Label>
          <input
            id="label"
            type="text"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            {...useFormContext<MCPAuthForm>().register('label')}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="domain">{localize('com_assistants_mcp_url')}</Label>
          <input
            id="domain"
            type="text"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            {...useFormContext<MCPAuthForm>().register('domain')}
          />
        </div>
      </div>
      <div className="flex items-center justify-end mt-4">
        <button
          onClick={saveMCP}
          className="focus:shadow-outline mt-1 flex min-w-[100px] items-center justify-center rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0 disabled:bg-green-400"
          type="button"
        >
          {getButtonContent()}
        </button>
      </div>
    </>
  );
} 