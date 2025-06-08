import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { ChevronLeft } from 'lucide-react';
import type { AgentPanelProps } from '~/common';
import { useToastContext } from '~/Providers';
import useLocalize from '~/hooks/useLocalize';
import { Panel } from '~/common';

export default function MCPPanel({
  action,
  setAction,
  agent_id,
  setActivePanel,
}: AgentPanelProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const methods = useForm({
    defaultValues: {
      // Add your form fields here
    },
  });

  const { reset } = methods;

  useEffect(() => {
    if (action?.metadata) {
      reset({
        // Reset form with action metadata
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

            <div className="text-xl font-medium">{(action ? 'Edit' : 'Add') + ' ' + 'MCP Server'}</div>
            <div className="text-xs text-text-secondary">
              {localize('com_assistants_mcp_server_info')}
            </div>
          </div>
          {/* Add your form fields here */}
        </div>
      </form>
    </FormProvider>
  );
} 