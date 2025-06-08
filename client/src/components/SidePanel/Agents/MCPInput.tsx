import { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { useToastContext } from '~/Providers';
import useLocalize from '~/hooks/useLocalize';
import { Spinner } from '~/components/svg';
import { Label, Checkbox } from '~/components/ui';
import { MCPAuthForm } from '~/common/types';
import { MCP } from 'librechat-data-provider/dist/types/types/assistants';

function useUpdateAgentMCP({ onSuccess, onError }: { onSuccess: (data: [string, MCP]) => void; onError: (error: Error) => void }) {
  return {
    mutate: async ({ mcp_id, metadata, agent_id }: { mcp_id?: string; metadata: MCP['metadata']; agent_id: string }) => {
      try {
        console.log('Mock update MCP:', { mcp_id, metadata, agent_id });
        // Simulate API call with delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        // Simulate API call
        const mockMCP: MCP = {
          mcp_id: mcp_id ?? 'new-mcp-id',
          agent_id,
          metadata: {
            ...metadata,
            tools: [
              'send_email',
              'create_calendar_event',
              'read_emails',
              'search_emails',
              'create_draft',
              'send_attachment',
              'create_label',
              'move_to_folder',
              'set_auto_reply',
              'get_email_stats'
            ]
          },
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
  const { handleSubmit, register } = useFormContext<MCPAuthForm>();
  const [isLoading, setIsLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  // Initialize tools list if editing existing MCP
  useEffect(() => {
    if (mcp?.mcp_id && mcp.metadata.tools) {
      setShowTools(true);
      setSelectedTools(mcp.metadata.tools);
    }
  }, [mcp]);

  const updateAgentMCP = useUpdateAgentMCP({
    onSuccess(data) {
      showToast({
        message: localize('com_assistants_update_mcp_success'),
        status: 'success',
      });
      setMCP(data[1]);
      setShowTools(true);
      setSelectedTools(data[1].metadata.tools ?? []);
      setIsLoading(false);
    },
    onError(error) {
      showToast({
        message: (error as Error).message || localize('com_assistants_update_mcp_error'),
        status: 'error',
      });
      setIsLoading(false);
    },
  });

  const saveMCP = handleSubmit((authFormData) => {
    const currentAgentId = agent_id ?? '';
    if (!currentAgentId) {
      return;
    }

    setIsLoading(true);
    let { metadata = {} } = mcp ?? {};
    const mcp_id = mcp?.mcp_id;
    metadata = {
      ...metadata,
      label: authFormData.label,
      domain: authFormData.domain,
    };

    updateAgentMCP.mutate({
      mcp_id,
      metadata,
      agent_id: currentAgentId,
    });
  });

  const handleSelectAll = () => {
    if (mcp?.metadata.tools) {
      setSelectedTools(mcp.metadata.tools);
    }
  };

  const handleDeselectAll = () => {
    setSelectedTools([]);
  };

  const handleToolToggle = (tool: string) => {
    setSelectedTools(prev => 
      prev.includes(tool) 
        ? prev.filter(t => t !== tool)
        : [...prev, tool]
    );
  };

  const handleToggleAll = () => {
    if (selectedTools.length === mcp?.metadata.tools?.length) {
      handleDeselectAll();
    } else {
      handleSelectAll();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="label">{localize('com_assistants_mcp_label')}</Label>
        <input
          id="label"
          {...register('label')}
          className="flex h-9 w-full rounded-lg border border-token-border-medium bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
          placeholder={localize('com_assistants_my_mcp_server')}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="domain">{localize('com_assistants_mcp_url')}</Label>
        <input
          id="domain"
          {...register('domain')}
          className="flex h-9 w-full rounded-lg border border-token-border-medium bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
          placeholder={'https://mcp.example.com'}
        />
      </div>
      <div className="flex items-center justify-end">
        <button
          onClick={saveMCP}
          disabled={isLoading}
          className="focus:shadow-outline mt-1 flex min-w-[100px] items-center justify-center rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0 disabled:bg-green-400"
          type="button"
        >
          {isLoading ? <Spinner className="icon-md" /> : (mcp?.mcp_id ? localize('com_ui_update') : localize('com_ui_create'))}
        </button>
      </div>

      {showTools && mcp?.metadata.tools && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-token-text-primary block font-medium">
              {localize('com_assistants_available_tools')}
            </h3>
            <button
              onClick={handleToggleAll}
              type="button"
              className="btn btn-neutral border-token-border-light relative h-8 rounded-full px-4 font-medium"
            >
              {selectedTools.length === mcp.metadata.tools.length 
                ? localize('com_ui_deselect_all')
                : localize('com_ui_select_all')}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {mcp.metadata.tools.map((tool) => (
              <label
                key={tool}
                htmlFor={tool}
                className="flex items-center border border-token-border-light rounded-lg p-2 hover:bg-token-surface-secondary cursor-pointer"
              >
                <Checkbox
                  id={tool}
                  checked={selectedTools.includes(tool)}
                  onCheckedChange={() => handleToolToggle(tool)}
                  className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                />
                <span className="text-token-text-primary">
                  {tool.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 