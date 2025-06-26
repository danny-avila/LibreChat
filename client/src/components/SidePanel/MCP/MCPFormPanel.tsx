import { useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import type { MCP } from 'librechat-data-provider';
import type { MCPForm } from '~/common';
import { OGDialog, OGDialogTrigger, Label } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { defaultMCPFormValues } from '~/common/mcp';
import useLocalize from '~/hooks/useLocalize';
import { TrashIcon } from '~/components/svg';
import MCPInput from './MCPInput';

interface MCPFormPanelProps {
  // Data
  mcp?: MCP;
  agent_id?: string;

  // Actions
  onBack: () => void;
  onDelete?: (mcp_id: string, agent_id: string) => void;
  onSave: (mcp: MCP) => void;

  // UI customization
  title?: string;
  subtitle?: string;
  showDeleteButton?: boolean;
  isDeleteDisabled?: boolean;
  deleteConfirmMessage?: string;

  // Form customization
  defaultValues?: Partial<MCPForm>;
}

export default function MCPFormPanel({
  mcp,
  agent_id,
  onBack,
  onDelete,
  onSave,
  title,
  subtitle,
  showDeleteButton = true,
  isDeleteDisabled = false,
  deleteConfirmMessage,
  defaultValues = defaultMCPFormValues,
}: MCPFormPanelProps) {
  const localize = useLocalize();

  const methods = useForm<MCPForm>({
    defaultValues: defaultValues,
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
        customHeaders: mcp.metadata.customHeaders ?? [],
        requestTimeout: mcp.metadata.requestTimeout,
        connectionTimeout: mcp.metadata.connectionTimeout,
      };

      reset(formData);
    }
  }, [mcp, reset]);

  const handleDelete = () => {
    if (onDelete && mcp?.mcp_id && agent_id) {
      onDelete(mcp.mcp_id, agent_id);
    }
  };

  return (
    <FormProvider {...methods}>
      <form className="h-full grow overflow-hidden">
        <div className="h-full overflow-auto px-2 pb-12 text-sm">
          <div className="relative flex flex-col items-center px-16 py-6 text-center">
            <div className="absolute left-0 top-6">
              <button type="button" className="btn btn-neutral relative" onClick={onBack}>
                <div className="flex w-full items-center justify-center gap-2">
                  <ChevronLeft />
                </div>
              </button>
            </div>

            {!!mcp && showDeleteButton && onDelete && (
              <OGDialog>
                <OGDialogTrigger asChild>
                  <div className="absolute right-0 top-6">
                    <button
                      type="button"
                      disabled={isDeleteDisabled || !mcp.mcp_id || !agent_id}
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
                      {deleteConfirmMessage || localize('com_ui_delete_mcp_confirm')}
                    </Label>
                  }
                  selection={{
                    selectHandler: handleDelete,
                    selectClasses:
                      'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
                    selectText: localize('com_ui_delete'),
                  }}
                />
              </OGDialog>
            )}

            <div className="text-xl font-medium">
              {title ||
                (mcp ? localize('com_ui_edit_mcp_server') : localize('com_ui_add_mcp_server'))}
            </div>
            <div className="text-xs text-text-secondary">
              {subtitle || localize('com_agents_mcp_info')}
            </div>
          </div>
          <MCPInput mcp={mcp} agent_id={agent_id} onSave={onSave} />
        </div>
      </form>
    </FormProvider>
  );
}
