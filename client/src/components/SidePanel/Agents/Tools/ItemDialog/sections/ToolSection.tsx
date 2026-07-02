import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useToastContext } from '@librechat/client';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { TError, TPluginAction } from 'librechat-data-provider';
import type { ToolItem } from '../../items/types';
import type { AgentForm } from '~/common';
import PluginAuthForm from '~/components/Plugins/Store/PluginAuthForm';
import { pluginNeedsAuth } from '../../items/auth';
import { useLocalize } from '~/hooks';

interface Props {
  item: ToolItem;
}

export default function ToolSection({ item }: Props) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const updateUserPlugins = useUpdateUserPluginsMutation();

  const requiresAuth = pluginNeedsAuth(item.plugin);
  const [savedAuth, setSavedAuth] = useState(false);
  const [editing, setEditing] = useState(false);

  const showForm = requiresAuth && (!savedAuth || editing);
  const showConfigured = requiresAuth && savedAuth && !editing;

  /** Add this tool's pluginKey to the agent's tools so it becomes usable. */
  const enableTool = () => {
    const current = (getValues('tools') ?? []) as string[];
    if (!current.includes(item.id)) {
      setValue('tools', [...current, item.id], { shouldDirty: true });
    }
  };

  const handleSubmit = (data: TPluginAction) => {
    const hasAuth = data.auth != null && Object.keys(data.auth).length > 0;
    if (!hasAuth) {
      enableTool();
      setSavedAuth(true);
      setEditing(false);
      return;
    }
    updateUserPlugins.mutate(data, {
      onError: (error: unknown) => {
        showToast({
          message: (error as TError)?.message || localize('com_nav_plugin_auth_error'),
          status: 'error',
        });
      },
      onSuccess: () => {
        enableTool();
        setSavedAuth(true);
        setEditing(false);
        showToast({ message: localize('com_ui_tool_credentials_saved'), status: 'success' });
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {item.description ? (
        <p className="text-sm leading-relaxed text-text-secondary">{item.description}</p>
      ) : (
        <p className="text-sm italic text-text-tertiary">
          {localize('com_ui_tools_no_description')}
        </p>
      )}
      {showConfigured && (
        <div className="flex items-center justify-between rounded-xl border border-border-light bg-surface-secondary px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
            {localize('com_ui_tools_info_configured')}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          >
            {localize('com_ui_edit')}
          </button>
        </div>
      )}
      {showForm && (
        <PluginAuthForm
          plugin={item.plugin}
          isEntityTool
          isSaving={updateUserPlugins.isLoading}
          onCancel={editing ? () => setEditing(false) : undefined}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
