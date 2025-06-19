import React, { memo, useRef, useMemo, useEffect, useCallback, useState } from 'react';
import { useRecoilState } from 'recoil';
import { Settings2 } from 'lucide-react';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { Constants, EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type { TPlugin, TPluginAuthConfig, TUpdateUserPlugins } from 'librechat-data-provider';
import MCPConfigDialog, { type ConfigFieldDetail } from '~/components/ui/MCPConfigDialog';
import { useAvailableToolsQuery } from '~/data-provider';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import MultiSelect from '~/components/ui/MultiSelect';
import { ephemeralAgentByConvoId } from '~/store';
import { useToastContext } from '~/Providers';
import MCPIcon from '~/components/ui/MCPIcon';
import { useLocalize } from '~/hooks';

interface McpServerInfo {
  name: string;
  pluginKey: string;
  authConfig?: TPluginAuthConfig[];
  authenticated?: boolean;
}

// Helper function to extract mcp_serverName from a full pluginKey like action_mcp_serverName
const getBaseMCPPluginKey = (fullPluginKey: string): string => {
  const parts = fullPluginKey.split(Constants.mcp_delimiter);
  return Constants.mcp_prefix + parts[parts.length - 1];
};

const storageCondition = (value: unknown, rawCurrentValue?: string | null) => {
  if (rawCurrentValue) {
    try {
      const currentValue = rawCurrentValue?.trim() ?? '';
      if (currentValue.length > 2) {
        return true;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return Array.isArray(value) && value.length > 0;
};

function MCPSelect({ conversationId }: { conversationId?: string | null }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const key = conversationId ?? Constants.NEW_CONVO;
  const hasSetFetched = useRef<string | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [selectedToolForConfig, setSelectedToolForConfig] = useState<McpServerInfo | null>(null);

  const { data: mcpToolDetails, isFetched } = useAvailableToolsQuery(EModelEndpoint.agents, {
    select: (data: TPlugin[]) => {
      const mcpToolsMap = new Map<string, McpServerInfo>();
      data.forEach((tool) => {
        const isMCP = tool.pluginKey.includes(Constants.mcp_delimiter);
        if (isMCP && tool.chatMenu !== false) {
          const parts = tool.pluginKey.split(Constants.mcp_delimiter);
          const serverName = parts[parts.length - 1];
          if (!mcpToolsMap.has(serverName)) {
            mcpToolsMap.set(serverName, {
              name: serverName,
              pluginKey: tool.pluginKey,
              authConfig: tool.authConfig,
              authenticated: tool.authenticated,
            });
          }
        }
      });
      return Array.from(mcpToolsMap.values());
    },
  });

  const updateUserPluginsMutation = useUpdateUserPluginsMutation({
    onSuccess: () => {
      setIsConfigModalOpen(false);
      showToast({ message: localize('com_nav_mcp_vars_updated'), status: 'success' });
    },
    onError: (error: unknown) => {
      console.error('Error updating MCP auth:', error);
      showToast({
        message: localize('com_nav_mcp_vars_update_error'),
        status: 'error',
      });
    },
  });

  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
  const mcpState = useMemo(() => {
    return ephemeralAgent?.mcp ?? [];
  }, [ephemeralAgent?.mcp]);

  const setSelectedValues = useCallback(
    (values: string[] | null | undefined) => {
      if (!values) {
        return;
      }
      if (!Array.isArray(values)) {
        return;
      }
      setEphemeralAgent((prev) => ({
        ...prev,
        mcp: values,
      }));
    },
    [setEphemeralAgent],
  );
  const [mcpValues, setMCPValues] = useLocalStorage<string[]>(
    `${LocalStorageKeys.LAST_MCP_}${key}`,
    mcpState,
    setSelectedValues,
    storageCondition,
  );

  useEffect(() => {
    if (hasSetFetched.current === key) {
      return;
    }
    if (!isFetched) {
      return;
    }
    hasSetFetched.current = key;
    if ((mcpToolDetails?.length ?? 0) > 0) {
      setMCPValues(mcpValues.filter((mcp) => mcpToolDetails?.some((tool) => tool.name === mcp)));
      return;
    }
    setMCPValues([]);
  }, [isFetched, setMCPValues, mcpToolDetails, key, mcpValues]);

  const renderSelectedValues = useCallback(
    (values: string[], placeholder?: string) => {
      if (values.length === 0) {
        return placeholder || localize('com_ui_select') + '...';
      }
      if (values.length === 1) {
        return values[0];
      }
      return localize('com_ui_x_selected', { 0: values.length });
    },
    [localize],
  );

  const mcpServerNames = useMemo(() => {
    return (mcpToolDetails ?? []).map((tool) => tool.name);
  }, [mcpToolDetails]);

  const handleConfigSave = useCallback(
    (targetName: string, authData: Record<string, string>) => {
      if (selectedToolForConfig && selectedToolForConfig.name === targetName) {
        const basePluginKey = getBaseMCPPluginKey(selectedToolForConfig.pluginKey);

        const payload: TUpdateUserPlugins = {
          pluginKey: basePluginKey,
          action: 'install',
          auth: authData,
        };
        updateUserPluginsMutation.mutate(payload);
      }
    },
    [selectedToolForConfig, updateUserPluginsMutation],
  );

  const handleConfigRevoke = useCallback(
    (targetName: string) => {
      if (selectedToolForConfig && selectedToolForConfig.name === targetName) {
        const basePluginKey = getBaseMCPPluginKey(selectedToolForConfig.pluginKey);

        const payload: TUpdateUserPlugins = {
          pluginKey: basePluginKey,
          action: 'uninstall',
          auth: {},
        };
        updateUserPluginsMutation.mutate(payload);
      }
    },
    [selectedToolForConfig, updateUserPluginsMutation],
  );

  const renderItemContent = useCallback(
    (serverName: string, defaultContent: React.ReactNode) => {
      const tool = mcpToolDetails?.find((t) => t.name === serverName);
      const hasAuthConfig = tool?.authConfig && tool.authConfig.length > 0;

      // Common wrapper for the main content (check mark + text)
      // Ensures Check & Text are adjacent and the group takes available space.
      const mainContentWrapper = (
        <div className="flex flex-grow items-center">{defaultContent}</div>
      );

      if (tool && hasAuthConfig) {
        return (
          <div className="flex w-full items-center justify-between">
            {mainContentWrapper}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setSelectedToolForConfig(tool);
                setIsConfigModalOpen(true);
              }}
              className="ml-2 flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-black/10 dark:hover:bg-white/10"
              aria-label={`Configure ${serverName}`}
            >
              <Settings2 className={`h-4 w-4 ${tool.authenticated ? 'text-green-500' : ''}`} />
            </button>
          </div>
        );
      }
      // For items without a settings icon, return the consistently wrapped main content.
      return mainContentWrapper;
    },
    [mcpToolDetails, setSelectedToolForConfig, setIsConfigModalOpen],
  );

  if (!mcpToolDetails || mcpToolDetails.length === 0) {
    return null;
  }

  return (
    <>
      <MultiSelect
        items={mcpServerNames}
        selectedValues={mcpValues ?? []}
        setSelectedValues={setMCPValues}
        defaultSelectedValues={mcpValues ?? []}
        renderSelectedValues={renderSelectedValues}
        renderItemContent={renderItemContent}
        placeholder={localize('com_ui_mcp_servers')}
        popoverClassName="min-w-fit"
        className="badge-icon min-w-fit"
        selectIcon={<MCPIcon className="icon-md text-text-primary" />}
        selectItemsClassName="border border-blue-600/50 bg-blue-500/10 hover:bg-blue-700/10"
        selectClassName="group relative inline-flex items-center justify-center md:justify-start gap-1.5 rounded-full border border-border-medium text-sm font-medium transition-all md:w-full size-9 p-2 md:p-3 bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner"
      />
      {selectedToolForConfig && (
        <MCPConfigDialog
          isOpen={isConfigModalOpen}
          onOpenChange={setIsConfigModalOpen}
          serverName={selectedToolForConfig.name}
          fieldsSchema={(() => {
            const schema: Record<string, ConfigFieldDetail> = {};
            if (selectedToolForConfig?.authConfig) {
              selectedToolForConfig.authConfig.forEach((field) => {
                schema[field.authField] = {
                  title: field.label,
                  description: field.description,
                };
              });
            }
            return schema;
          })()}
          initialValues={(() => {
            const initial: Record<string, string> = {};
            // Note: Actual initial values might need to be fetched if they are stored user-specifically
            if (selectedToolForConfig?.authConfig) {
              selectedToolForConfig.authConfig.forEach((field) => {
                initial[field.authField] = ''; // Or fetched value
              });
            }
            return initial;
          })()}
          onSave={(authData) => {
            if (selectedToolForConfig) {
              handleConfigSave(selectedToolForConfig.name, authData);
            }
          }}
          onRevoke={() => {
            if (selectedToolForConfig) {
              handleConfigRevoke(selectedToolForConfig.name);
            }
          }}
          isSubmitting={updateUserPluginsMutation.isLoading}
        />
      )}
    </>
  );
}

export default memo(MCPSelect);
