import { memo, useState, useCallback, KeyboardEvent, useEffect } from 'react';
import { XCircle, PlusCircleIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFormContext } from 'react-hook-form';
import { MCPPromptResponse, TPluginAction, TError } from 'librechat-data-provider';
import { Label } from '@librechat/client';
import { useGetAllMCPPrompts } from '~/data-provider';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import { useLocalize, usePluginDialogHelpers } from '~/hooks';
import { cn } from '~/utils';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { AgentForm } from '~/common';

interface DashGroupItemMCPProps {
  mcpPrompt: MCPPromptResponse;
  instanceProjectId?: string;
  agentAddPrompts?: boolean;
}

function DashGroupAddItemMCPComponent({ mcpPrompt, instanceProjectId }: DashGroupItemMCPProps) {
  const params = useParams();
  const navigate = useNavigate();
  const localize = useLocalize();
  const { data: mcp_prompts } = useGetAllMCPPrompts();
  const groupedPrompts = mcp_prompts;

  if (!mcpPrompt.mcpServerName) {
    mcpPrompt.mcpServerName = mcpPrompt.promptKey.split('_mcp_')[1];
  }
  const selectedPrompts = localStorage.getItem('agent-mcpPrompts') ?? '';

  const handleContainerClick = useCallback(() => {
    navigate(`/d/prompts/mcp/${mcpPrompt.promptKey}/?agentAdd=true`, { replace: true });
  }, [mcpPrompt.promptKey, navigate]);

  const { getValues, setValue, watch } = useFormContext<AgentForm>();
  const formIsInstalled = getValues('mcp_prompts')?.includes(mcpPrompt.promptKey);

  // Add local state to track installation status
  const [localIsInstalled, setLocalIsInstalled] = useState(formIsInstalled);

  // Use local state for UI, but sync with form state
  let isInstalled = localIsInstalled ?? formIsInstalled;

  const selectedPromptsArray = selectedPrompts ? JSON.parse(selectedPrompts) : [];
  const matchedSelected = selectedPromptsArray.filter(
    (item) => item.promptKey === mcpPrompt.promptKey,
  );
  if (matchedSelected.length > 0) {
    isInstalled = true;
  }

  const watchedPrompts = watch('mcp_prompts');
  // Save to localStorage whenever prompts change
  useEffect(() => {
    if (watchedPrompts) {
      localStorage.setItem('agent-prompts', JSON.stringify(watchedPrompts));
    }
  }, [watchedPrompts]);

  // Load from localStorage on component mount
  useEffect(() => {
    const savedPrompts = localStorage.getItem('agent-prompts');
    if (savedPrompts) {
      try {
        const parsedPrompts = JSON.parse(savedPrompts);
        setValue('mcp_prompts', parsedPrompts);
        //localStorage.removeItem('agent-prompts');
      } catch (error) {
        console.error('Error parsing saved prompts:', error);
      }
    }
  }, [setValue]);

  const {
    setMaxPage,
    setCurrentPage,
    itemsPerPage,
    searchChanged,
    setSearchChanged,
    searchValue,
    setError,
    setErrorMessage,
    setShowPluginAuthForm,
    setSelectedMCPPlugin,
  } = usePluginDialogHelpers();

  const updateUserPlugins = useUpdateUserPluginsMutation();
  const handleInstallError = (error: TError) => {
    setError(true);
    const errorMessage = error.response?.data?.message ?? '';
    if (errorMessage) {
      setErrorMessage(errorMessage);
    }
    setTimeout(() => {
      setError(false);
      setErrorMessage('');
    }, 5000);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        navigate(`/d/prompts/mcp/${mcpPrompt.promptKey}/?agentAdd=true`, { replace: true });
      }
    },
    [mcpPrompt.promptKey, navigate],
  );

  const handleInstall = (pluginAction: TPluginAction) => {
    const addFunction = () => {
      const installedPromptIds: string[] = getValues('mcp_prompts') || [];
      // Add the parent
      installedPromptIds.push(pluginAction.pluginKey);
      setValue('mcp_prompts', Array.from(new Set(installedPromptIds))); // no duplicates just in case
    };

    if (!pluginAction.auth) {
      return addFunction();
    }

    updateUserPlugins.mutate(pluginAction, {
      onError: (error: unknown) => {
        handleInstallError(error as TError);
      },
      onSuccess: addFunction,
    });

    setShowPluginAuthForm(false);
  };

  const onRemovePrompt = (mcpName: string, mcpServerName: string) => {
    const promptId = `${mcpName}_mcp_${mcpServerName}`;
    const groupObj = groupedPrompts?.[promptId];
    const promptIdstoRemove = [promptId];
    if (groupObj && groupObj.length > 0) {
      promptIdstoRemove.push(...groupObj.map((sub) => sub.promptId));
    }
    // Remove these from the formTools
    updateUserPlugins.mutate(
      { pluginKey: promptId, action: 'uninstall', auth: {}, isEntityTool: true },
      {
        onError: (error: unknown) => handleInstallError(error as TError),
        onSuccess: () => {
          const remainingPromptIds =
            getValues('mcp_prompts')?.filter((promptId) => !promptIdstoRemove.includes(promptId)) ||
            [];
          setValue('mcp_prompts', remainingPromptIds);
          setLocalIsInstalled(false);
        },
      },
    );
  };

  const onAddPrompt = (mcpName: string, mcpServerName: string) => {
    const promptId = `${mcpName}_mcp_${mcpServerName}`;
    setShowPluginAuthForm(false);
    const getAvailablePluginFromKey = mcp_prompts ? mcp_prompts[promptId] : '';

    if (getAvailablePluginFromKey) {
      setSelectedMCPPlugin(getAvailablePluginFromKey);
      setLocalIsInstalled(true);
      handleInstall({ pluginKey: promptId, action: 'install', auth: {} });
    } else {
      console.warn(`Prompt "${mcpServerName}" not found`);
      // Optionally show error to user or handle gracefully
    }
  };

  const filteredPrompts = Object.values(groupedPrompts || {}).filter(
    (prompt: MCPPromptResponse & { prompts?: MCPPromptResponse[] }) => {
      // Check if the parent tool matches
      if (prompt.name?.toLowerCase().includes(searchValue.toLowerCase())) {
        return true;
      }
      // Check if any child tools match
      if (prompt.prompts) {
        return prompt.prompts.some((childPrompt) =>
          childPrompt?.name?.toLowerCase().includes(searchValue.toLowerCase()),
        );
      }
      return false;
    },
  );

  useEffect(() => {
    if (filteredPrompts) {
      setMaxPage(Math.ceil(Object.keys(filteredPrompts || {}).length / itemsPerPage));
      if (searchChanged) {
        setCurrentPage(1);
        setSearchChanged(false);
      }
    }
  }, [
    mcp_prompts,
    itemsPerPage,
    searchValue,
    filteredPrompts,
    searchChanged,
    setMaxPage,
    setCurrentPage,
    setSearchChanged,
  ]);

  useEffect(() => {
    setLocalIsInstalled(formIsInstalled);
  }, [formIsInstalled]);

  return (
    <div
      className={cn(
        'mx-2 my-2 flex cursor-pointer rounded-lg border border-border-light bg-surface-primary p-3 shadow-sm transition-all duration-300 ease-in-out hover:bg-surface-secondary',
        params.promptId === instanceProjectId && 'bg-surface-hover',
      )}
      onClick={handleContainerClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${mcpPrompt.name} prompt group`}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2 truncate pr-2">
          <CategoryIcon category={'mcpServer'} className="icon-lg" aria-hidden="true" />
          <Label className="text-md cursor-pointer truncate font-semibold text-text-primary">
            {mcpPrompt.name}
          </Label>
        </div>

        <div className="flex h-full items-center gap-2">
          {!isInstalled ? (
            <button
              className="btn btn-primary relative"
              aria-label={`${localize('com_ui_add')} ${name}`}
              onClick={() => onAddPrompt(mcpPrompt.name, mcpPrompt.mcpServerName)}
            >
              <div className="flex w-full items-center justify-center gap-2">
                {localize('com_ui_add')}
                <PlusCircleIcon className="flex h-4 w-4 items-center stroke-2" />
              </div>
            </button>
          ) : (
            <button
              className="btn relative bg-gray-300 hover:bg-gray-400 dark:bg-gray-50 dark:hover:bg-gray-200"
              onClick={() => onRemovePrompt(mcpPrompt.name, mcpPrompt.mcpServerName)}
              aria-label={`${localize('com_nav_tool_remove')} ${name}`}
            >
              <div className="flex w-full items-center justify-center gap-2">
                {localize('com_nav_tool_remove')}
                <XCircle className="flex h-4 w-4 items-center stroke-2" />
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(DashGroupAddItemMCPComponent);
