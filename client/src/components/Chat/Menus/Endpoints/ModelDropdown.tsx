import React, { useMemo, memo, useCallback, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronRight, Search } from 'lucide-react';
import {
  EModelEndpoint,
  PermissionTypes,
  Permissions,
  alternateName,
  LocalStorageKeys,
  isAgentsEndpoint,
} from 'librechat-data-provider';
import type { TConversation, Agent } from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { cn, mapEndpoints, getIconKey, getEndpointField, getConvoSwitchLogic } from '~/utils';
import { useHasAccess, useDefaultConvo, useSetIndexOptions, useLocalize } from '~/hooks';
import { useGetEndpointsQuery } from '~/data-provider';
import { Menu, MenuItem } from './menu';
import { useChatContext, useAgentsMapContext } from '~/Providers';
import { mainTextareaId } from '~/common';
import { icons } from './Icons';
import store from '~/store';
import Icon from '~/components/Endpoints/Icon';

interface ExtendedEndpoint {
  value: EModelEndpoint;
  label: string;
  hasModels: boolean;
  icon: JSX.Element | null;
  models?: string[];
  agentNames?: Record<string, string>;
}

export function ModelDropdown(): JSX.Element {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: endpoints = [] } = useGetEndpointsQuery({ select: mapEndpoints });
  const modelsQuery = useGetModelsQuery();
  const { conversation, newConversation, index } = useChatContext();
  const { setOption } = useSetIndexOptions();
  const timeoutIdRef = useRef<NodeJS.Timeout>();
  const getDefaultConversation = useDefaultConvo();
  const localize = useLocalize();

  const { endpoint, agent_id: selectedAgentId } = conversation ?? {};

  const agentsMapResult = useAgentsMapContext();
  const agentsMap = useMemo(() => {
    return agentsMapResult ?? {};
  }, [agentsMapResult]);

  const agents: Agent[] = useMemo(() => {
    return Object.values(agentsMap) as Agent[];
  }, [agentsMap]);

  const hasAgentAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const modularChat = useRecoilValue(store.modularChat);
  const [openDropdownFor, setOpenDropdownFor] = useState<string | null>(endpoint || null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEndpoints = useMemo(() => {
    const endpointsCopy = [...endpoints];
    if (!hasAgentAccess) {
      const index = endpointsCopy.indexOf(EModelEndpoint.agents);
      if (index > -1) {
        endpointsCopy.splice(index, 1);
      }
    }
    return endpointsCopy;
  }, [endpoints, hasAgentAccess]);

  const mappedEndpoints: ExtendedEndpoint[] = useMemo(
    () =>
      filteredEndpoints.map((ep) => {
        const endpointType = getEndpointField(endpointsConfig, ep, 'type');
        const iconKey = getIconKey({ endpoint: ep, endpointsConfig, endpointType });
        const Icon = icons[iconKey];
        const hasModels =
          (ep === EModelEndpoint.agents && agents.length > 0) ||
          (ep !== EModelEndpoint.assistants && (modelsQuery.data?.[ep]?.length ?? 0) > 0);

        const result: ExtendedEndpoint = {
          value: ep,
          label: alternateName[ep] || ep,
          hasModels,
          icon: Icon ? (
            <Icon
              size={18}
              endpoint={ep}
              context={'menu-item'}
              className="icon-md shrink-0 dark:text-white"
              iconURL={getEndpointField(endpointsConfig, ep, 'iconURL')}
            />
          ) : null,
        };

        if (ep === EModelEndpoint.agents && agents.length > 0) {
          result.models = agents.map((agent) => agent.id);
          result.agentNames = agents.reduce((acc: Record<string, string>, agent) => {
            acc[agent.id] = agent.name || '';
            return acc;
          }, {});
        }

        return result;
      }),
    [filteredEndpoints, endpointsConfig, modelsQuery.data, agents],
  );

  const filteredMenuItems: ExtendedEndpoint[] = useMemo(() => {
    if (!searchTerm.trim()) {
      return mappedEndpoints;
    }
    return mappedEndpoints
      .map((ep) => {
        if (ep.hasModels) {
          if (ep.value === EModelEndpoint.agents) {
            const filteredAgents = agents.filter((agent) =>
              agent.name?.toLowerCase().includes(searchTerm.toLowerCase()),
            );
            if (
              ep.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
              filteredAgents.length > 0
            ) {
              return {
                ...ep,
                models: filteredAgents.map((agent) => agent.id),
                agentNames: filteredAgents.reduce((acc: Record<string, string>, agent) => {
                  acc[agent.id] = agent.name || '';
                  return acc;
                }, {}),
              };
            }
            return null;
          } else {
            const allModels = modelsQuery.data?.[ep.value] ?? [];
            const filteredModels = allModels.filter((model: string) =>
              model.toLowerCase().includes(searchTerm.toLowerCase()),
            );
            if (
              ep.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
              filteredModels.length > 0
            ) {
              return { ...ep, models: filteredModels };
            }
            return null;
          }
        } else {
          return ep.label.toLowerCase().includes(searchTerm.toLowerCase())
            ? { ...ep, models: [] }
            : null;
        }
      })
      .filter(Boolean) as ExtendedEndpoint[];
  }, [searchTerm, mappedEndpoints, modelsQuery.data, agents]);

  const setAgentId = useCallback(
    (agentId: string) => {
      setOption('agent_id')(agentId);
      localStorage.setItem(`${LocalStorageKeys.AGENT_ID_PREFIX}${index}`, agentId);
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = setTimeout(() => {
        const textarea = document.getElementById(mainTextareaId);
        if (textarea) {
          textarea.focus();
        }
      }, 150);
    },
    [setOption, index],
  );

  const setModel = useCallback(
    (model: string) => {
      setOption('model')(model);
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = setTimeout(() => {
        const textarea = document.getElementById(mainTextareaId);
        if (textarea) {
          textarea.focus();
        }
      }, 150);
    },
    [setOption],
  );

  const handleModelSelect = useCallback(
    (ep: EModelEndpoint, selectedModel: string) => {
      if (ep === EModelEndpoint.agents) {
        if (conversation?.endpoint === ep) {
          setAgentId(selectedModel);
          return;
        }

        const { template } = getConvoSwitchLogic({
          newEndpoint: ep,
          modularChat: false,
          conversation,
          endpointsConfig,
        });

        const currentConvo = getDefaultConversation({
          conversation: { ...conversation, endpoint: ep, agent_id: selectedModel },
          preset: { ...template, endpoint: ep, agent_id: selectedModel },
        });

        newConversation({
          template: currentConvo,
          preset: currentConvo,
          keepLatestMessage: true,
        });
        return;
      }

      const {
        template,
        shouldSwitch,
        isNewModular,
        newEndpointType,
        isCurrentModular,
        isExistingConversation,
      } = getConvoSwitchLogic({
        newEndpoint: ep,
        modularChat,
        conversation,
        endpointsConfig,
      });

      const isModular = isCurrentModular && isNewModular && shouldSwitch;

      if (isExistingConversation && isModular) {
        template.endpointType = newEndpointType;

        const currentConvo = getDefaultConversation({
          /* target endpointType is necessary to avoid endpoint mixing */
          conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
          preset: template,
        });

        /* We don't reset the latest message, only when changing settings mid-converstion */
        newConversation({
          template: currentConvo,
          preset: currentConvo,
          keepLatestMessage: true,
          keepAddedConvos: true,
        });
        return;
      }
      newConversation({
        template: { ...(template as Partial<TConversation>) },
        keepAddedConvos: isModular,
      });

      setModel(selectedModel);
    },
    [
      conversation,
      endpointsConfig,
      newConversation,
      getDefaultConversation,
      modelsQuery.data,
      setModel,
      setAgentId,
    ],
  );

  const handleEndpointSelect = useCallback(
    (ep: string, hasModels: boolean) => {
      if (hasModels) {
        setOpenDropdownFor(ep);

        if (conversation?.endpoint !== ep) {
          // If changing to a different endpoint with models, first switch to that endpoint
          const newEndpoint = ep as EModelEndpoint;
          const { template } = getConvoSwitchLogic({
            newEndpoint,
            modularChat: false,
            conversation,
            endpointsConfig,
          });

          let initialModel = '';
          let initialAgentId = '';

          if (newEndpoint === EModelEndpoint.agents && agents.length > 0) {
            initialAgentId = agents[0].id;
          } else if (
            modelsQuery.data &&
            modelsQuery.data[newEndpoint] &&
            modelsQuery.data[newEndpoint].length > 0
          ) {
            initialModel = modelsQuery.data[newEndpoint][0];
          }

          const currentConvo = getDefaultConversation({
            conversation: {
              ...conversation,
              endpoint: newEndpoint,
              model: initialModel,
              agent_id: initialAgentId,
            },
            preset: {
              ...template,
              endpoint: newEndpoint,
              model: initialModel,
              agent_id: initialAgentId,
            },
          });

          newConversation({
            template: currentConvo,
            preset: currentConvo,
            keepLatestMessage: true,
          });
        }
        return;
      }

      if (!hasModels) {
        const newEndpoint = ep as EModelEndpoint;
        const { template } = getConvoSwitchLogic({
          newEndpoint,
          modularChat: false,
          conversation,
          endpointsConfig,
        });
        const currentConvo = getDefaultConversation({
          conversation: { ...conversation, endpoint: newEndpoint },
          preset: { ...template, endpoint: newEndpoint },
        });
        newConversation({
          template: currentConvo,
          preset: currentConvo,
          keepLatestMessage: true,
        });
      }
    },
    [
      conversation,
      endpointsConfig,
      newConversation,
      getDefaultConversation,
      modelsQuery.data,
      agents,
    ],
  );

  const currentEndpointItem = mappedEndpoints.find((item) => item.value === endpoint);
  const hasModelsOnCurrent = currentEndpointItem?.hasModels;

  const displayValue = endpoint
    ? hasModelsOnCurrent
      ? isAgentsEndpoint(endpoint as string)
        ? agentsMap[selectedAgentId || '']?.name || localize('com_sidepanel_select_agent')
        : conversation?.model || alternateName[endpoint] || endpoint
      : alternateName[endpoint] || endpoint
    : 'Select an endpoint';

  return (
    <div className="relative">
      <Menu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        className="animate-popover"
        label={
          <div
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              'flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary',
              menuOpen
                ? 'bg-surface-tertiary hover:bg-surface-tertiary'
                : 'bg-surface-secondary hover:bg-surface-tertiary',
            )}
          >
            {currentEndpointItem && currentEndpointItem.icon && (
              <div
                className={cn(
                  'flex h-5 w-5 items-center justify-center overflow-hidden text-text-primary',
                  isAgentsEndpoint(endpoint as string) && selectedAgentId ? 'rounded-full' : '',
                )}
              >
                {isAgentsEndpoint(endpoint as string) && selectedAgentId ? (
                  <Icon
                    isCreatedByUser={false}
                    endpoint={endpoint}
                    agentName={agentsMap[selectedAgentId]?.name || ''}
                    iconURL={agentsMap[selectedAgentId]?.avatar?.filepath}
                    className="rounded-full"
                  />
                ) : (
                  currentEndpointItem.icon
                )}
              </div>
            )}
            <span className="flex-grow truncate text-left">{displayValue}</span>
          </div>
        }
      >
        <div className="py-1.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-primary" />
            <input
              type="text"
              placeholder="Search endpoints and models"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md bg-surface-secondary py-2 pl-9 pr-3 text-sm text-text-primary focus:outline-none"
            />
          </div>
        </div>
        {filteredMenuItems.map((ep) =>
          ep.hasModels ? (
            <Menu
              key={ep.value}
              className="animate-popover-left"
              defaultOpen={openDropdownFor === ep.value}
              onOpenChange={(open) => {
                if (open) {
                  setOpenDropdownFor(ep.value);
                }
              }}
              label={
                <div
                  onClick={() => handleEndpointSelect(ep.value, true)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary"
                >
                  <div className="flex items-center">
                    {ep.icon && (
                      <div className="mr-2 flex h-5 w-5 items-center justify-center overflow-hidden text-text-primary">
                        {ep.icon}
                      </div>
                    )}
                    <span className="truncate text-left">{ep.label}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-secondary" />
                </div>
              }
            >
              {ep.value === EModelEndpoint.agents
                ? (ep.models || []).map((agentId: string) => (
                  <MenuItem
                    key={agentId}
                    onClick={() => handleModelSelect(ep.value as EModelEndpoint, agentId)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-start rounded-md px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary',
                      selectedAgentId === agentId && conversation?.endpoint === ep.value
                        ? 'bg-surface-tertiary'
                        : '',
                    )}
                  >
                    <div className="mr-2 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                      <Icon
                        isCreatedByUser={false}
                        endpoint={ep.value}
                        agentName={ep.agentNames?.[agentId] || ''}
                        iconURL={agentsMap[agentId]?.avatar?.filepath}
                      />
                    </div>
                    {ep.agentNames?.[agentId] || agentId}
                  </MenuItem>
                ))
                : (ep.models !== undefined ? ep.models : (modelsQuery.data?.[ep.value] ?? [])).map(
                  (modelName: string) => (
                    <MenuItem
                      key={modelName}
                      onClick={() => handleModelSelect(ep.value as EModelEndpoint, modelName)}
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-start rounded-md px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary',
                        conversation?.model === modelName && conversation?.endpoint === ep.value
                          ? 'bg-surface-tertiary'
                          : '',
                      )}
                    >
                      {modelName}
                    </MenuItem>
                  ),
                )}
            </Menu>
          ) : (
            <MenuItem
              key={ep.value}
              onClick={() => handleEndpointSelect(ep.value, false)}
              className="flex w-full cursor-pointer items-center justify-start rounded-md px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary"
            >
              {ep.icon && (
                <div className="mr-2 flex h-5 w-5 items-center justify-center overflow-hidden text-text-primary">
                  {ep.icon}
                </div>
              )}
              {ep.label}
            </MenuItem>
          ),
        )}
      </Menu>
    </div>
  );
}

export default memo(ModelDropdown);
