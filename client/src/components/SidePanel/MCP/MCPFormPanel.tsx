import { useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import type { MCPForm } from '~/common';
import {
  useCreateMCPMutation,
  useUpdateMCPMutation,
  useDeleteMCPMutation,
} from '~/data-provider/MCPs/mutations';
import type { MCP } from 'librechat-data-provider';
import { OGDialog, OGDialogTrigger, Label } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { defaultMCPFormValues } from '~/common/mcp';
import { useToastContext } from '~/Providers';
import useLocalize from '~/hooks/useLocalize';
import { TrashIcon } from '~/components/svg';
import MCPInput from './MCPInput';

interface MCPFormPanelProps {
  // Data
  mcp?: MCP;

  // Actions
  onBack: () => void;

  // UI customization
  title?: string;
  subtitle?: string;
  showDeleteButton?: boolean;
  deleteConfirmMessage?: string;

  // Form customization
  defaultValues?: Partial<MCPForm>;
}

export default function MCPFormPanel({
  mcp,
  onBack,
  title,
  subtitle,
  showDeleteButton = true,
  deleteConfirmMessage,
  defaultValues = defaultMCPFormValues,
}: MCPFormPanelProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const create = useCreateMCPMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_update_mcp_success'),
        status: 'success',
      });
      onBack();
    },
    onError: (error) => {
      console.error('Error creating MCP:', error);
      showToast({
        message: localize('com_ui_update_mcp_error'),
        status: 'error',
      });
    },
  });

  const update = useUpdateMCPMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_update_mcp_success'),
        status: 'success',
      });
      onBack();
    },
    onError: (error) => {
      console.error('Error updating MCP:', error);
      showToast({
        message: localize('com_ui_update_mcp_error'),
        status: 'error',
      });
    },
  });

  const deleteMCP = useDeleteMCPMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_delete_mcp_success'),
        status: 'success',
      });
      onBack();
    },
    onError: (error) => {
      console.error('Error deleting MCP:', error);
      showToast({
        message: localize('com_ui_delete_mcp_error'),
        status: 'error',
      });
    },
  });

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

  const handleSave = (mcpData: MCP) => {
    if (mcp) {
      // Update existing MCP
      update.mutate({ mcp_id: mcp.mcp_id, data: mcpData });
    } else {
      // Create new MCP
      create.mutate(mcpData);
    }
  };

  const handleDelete = () => {
    if (mcp?.mcp_id) {
      deleteMCP.mutate({ mcp_id: mcp.mcp_id });
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

            {!!mcp && showDeleteButton && (
              <OGDialog>
                <OGDialogTrigger asChild>
                  <div className="absolute right-0 top-6">
                    <button
                      type="button"
                      disabled={!mcp.mcp_id}
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
            <div className="text-xs text-text-secondary">{subtitle || ''}</div>
          </div>
          <MCPInput
            mcp={mcp}
            agent_id=""
            onSave={handleSave}
            isLoading={create.isLoading || update.isLoading}
          />
        </div>
      </form>
    </FormProvider>
  );
}
