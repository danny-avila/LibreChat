import { useEffect } from 'react';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { ChevronLeft } from 'lucide-react';
import type { AgentPanelProps } from '~/common';
import { useToastContext } from '~/Providers';
import useLocalize from '~/hooks/useLocalize';
import { Panel } from '~/common';
import ActionsAuth from '~/components/SidePanel/Builder/ActionsAuth';
import FormInput from '~/components/ui/FormInput';

export default function MCPPanel({
  agent_id,
  setActivePanel,
}: AgentPanelProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const methods = useForm<any>({
    defaultValues: {
      url: '',
      label: '',
    },
  });

  const { control } = methods;

  const onSubmit = (data: any) => {
    // TODO: Implement MCP server creation/update
    console.log('Form submitted:', data);
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

          <div className="space-y-4 px-4">
            <Controller
              name="url"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <FormInput
                  field={field}
                  label={localize('com_assistants_mcp_url')}
                  placeholder="https://mcp.example.com"
                />
              )}
            />

            <Controller
              name="label"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <FormInput
                  field={field}
                  label={localize('com_assistants_mcp_label')}
                  placeholder={localize('com_assistants_my_mcp_server')}
                />
              )}
            />

            <ActionsAuth />

            <button
              type="submit"
              className="btn btn-primary relative h-9 w-full rounded-lg font-medium"
            >
              {localize('com_ui_create')}
            </button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
} 