import { useLocalize } from "~/hooks";
import { useToastContext } from '@librechat/client';
import AgentPanel from "../SidePanel/Agents/AgentPanel";
import { useCallback } from "react";
import { useForm } from "react-hook-form";
import { AgentForm } from "~/common";
import { getDefaultAgentFormValues } from "~/utils";
import { AgentPanelProvider } from "~/Providers";

// Brand configuration
const BRAND_CONFIG = {
  primaryColor: 'from-blue-600 to-blue-700',
  brandName: 'LibreChat',
  icon: '💬',
};

interface AgentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  agent?: any;
  isCreate?: boolean;
}

export default function AgentModal({ open, onClose, onSuccess, isCreate, agent }: AgentModalProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const methods = useForm<AgentForm>({
    defaultValues: getDefaultAgentFormValues(),
  });
  const { control, handleSubmit, reset, setValue } = methods;

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  if (!open) return null;

  return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
    <div className="relative w-full max-w-6xl max-h-[90vh] rounded-lg bg-white shadow-2xl dark:bg-gray-800 overflow-hidden">
      {/* Header with Brand */}
      <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-750 border-b border-blue-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-lg">
            {BRAND_CONFIG.icon}
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-400 dark:to-blue-500 bg-clip-text text-transparent">
              {isCreate ? `Create New ${localize('com_ui_agent')}` : `Edit ${localize('com_ui_agent')}`}
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              {BRAND_CONFIG.brandName} Agent Manager
            </p>
          </div>
        </div>
        <button
          className="text-2xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          onClick={handleClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Form Content */}
      <div className="overflow-y-auto max-h-[calc(90vh-120px)] px-5">
        <AgentPanelProvider>
          <AgentPanel onSuccess={handleClose} showSelection={false} selectedAgentId={isCreate?null:agent.id}></AgentPanel>
        </AgentPanelProvider>
      </div>
    </div>
  </div>;
}