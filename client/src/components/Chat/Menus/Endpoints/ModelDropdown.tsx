import React, { useMemo, memo, useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronRight, Search, Settings } from 'lucide-react';
import {
  EModelEndpoint,
  PermissionTypes,
  Permissions,
  alternateName,
  LocalStorageKeys,
  isAgentsEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TConversation, Agent } from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { cn, mapEndpoints, getIconKey, getEndpointField, getConvoSwitchLogic } from '~/utils';
import {
  useHasAccess,
  useDefaultConvo,
  useSetIndexOptions,
  useLocalize,
  useAssistantListMap,
} from '~/hooks';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { useGetEndpointsQuery } from '~/data-provider';
import Icon from '~/components/Endpoints/Icon';
import { mainTextareaId } from '~/common';
import { Menu, MenuItem } from './menu';
import { icons } from './Icons';
import store from '~/store';

interface ExtendedEndpoint {
  value: EModelEndpoint;
  label: string;
  hasModels: boolean;
  icon: JSX.Element | null;
  models?: string[];
  agentNames?: Record<string, string>;
  assistantNames?: Record<string, string>;
}

export function ModelDropdown(): JSX.Element {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: endpoints = [] } = useGetEndpointsQuery({ select: mapEndpoints });
  const modelsQuery = useGetModelsQuery();
  const { conversation, newConversation, index } = useChatContext();
  const { setOption } = useSetIndexOptions();
  const timeoutIdRef = useRef<NodeJS.Timeout>();
  const getDefaultConversation = useDefaultConvo();
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyDialogEndpoint, setKeyDialogEndpoint] = useState<EModelEndpoint | null>(null);
  const localize = useLocalize();

  const endpointRequiresUserKey = useCallback(
    (ep: string) => {
      return !!getEndpointField(endpointsConfig, ep, 'userProvide');
    },
    [endpointsConfig],
  );

  const {
    endpoint,
    agent_id: selectedAgentId,
    assistant_id: selectedAssistantId,
  } = conversation ?? {};

  const agentsMapResult = useAgentsMapContext();
  const agentsMap = useMemo(() => {
    return agentsMapResult ?? {};
  }, [agentsMapResult]);

  const agents: Agent[] = useMemo(() => {
    return Object.values(agentsMap) as Agent[];
  }, [agentsMap]);

  const assistantListMap = useAssistantListMap((res) =>
    res.data.map(({ id, name, metadata, model }) => ({ id, name, metadata, model })),
  );

  const assistantsMapResult = useAssistantsMapContext();
  const assistantsMap = useMemo(() => {
    return assistantsMapResult ?? {};
  }, [assistantsMapResult]);

  const assistants = useMemo(() => {
    return assistantListMap[endpoint as string] ?? [];
  }, [endpoint, assistantListMap]);

  const hasAgentAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const modularChat = useRecoilValue(store.modularChat);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDropdownFor, setOpenDropdownFor] = useState<string | null>(null);

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
          (ep === EModelEndpoint.assistants && assistants.length > 0) ||
          (ep !== EModelEndpoint.assistants &&
            ep !== EModelEndpoint.agents &&
            (modelsQuery.data?.[ep]?.length ?? 0) > 0);

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

        if (ep === EModelEndpoint.assistants && assistants.length > 0) {
          result.models = assistants.map((assistant) => assistant.id);
          result.assistantNames = assistants.reduce((acc: Record<string, string>, assistant) => {
            acc[assistant.id] = assistant.name || '';
            return acc;
          }, {});
        }

        return result;
      }),
    [filteredEndpoints, endpointsConfig, modelsQuery.data, agents, assistants],
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
          } else if (ep.value === EModelEndpoint.assistants) {
            const filteredAssistants = assistants.filter((assistant) =>
              assistant.name?.toLowerCase().includes(searchTerm.toLowerCase()),
            );
            if (
              ep.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
              filteredAssistants.length > 0
            ) {
              return {
                ...ep,
                models: filteredAssistants.map((assistant) => assistant.id),
                assistantNames: filteredAssistants.reduce(
                  (acc: Record<string, string>, assistant) => {
                    acc[assistant.id] = assistant.name || '';
                    return acc;
                  },
                  {},
                ),
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
  }, [searchTerm, mappedEndpoints, modelsQuery.data, agents, assistants]);

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

  const setAssistantId = useCallback(
    (assistantId: string) => {
      const assistant = assistantsMap[endpoint as string]?.[assistantId];
      if (assistant) {
        setOption('model')(assistant.model);
        setOption('assistant_id')(assistantId);
        localStorage.setItem(`${LocalStorageKeys.ASST_ID_PREFIX}${index}${endpoint}`, assistantId);
      }
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = setTimeout(() => {
        const textarea = document.getElementById(mainTextareaId);
        if (textarea) {
          textarea.focus();
        }
      }, 150);
    },
    [setOption, index, endpoint, assistantsMap],
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
      if (ep === EModelEndpoint.assistants) {
        if (conversation?.endpoint === ep) {
          setAssistantId(selectedModel);
          return;
        }

        const { template } = getConvoSwitchLogic({
          newEndpoint: ep,
          modularChat: false,
          conversation,
          endpointsConfig,
        });

        const assistant = assistantsMap[ep]?.[selectedModel];

        const currentConvo = getDefaultConversation({
          conversation: {
            ...conversation,
            endpoint: ep,
            assistant_id: selectedModel,
            model: assistant?.model || '',
          },
          preset: {
            ...template,
            endpoint: ep,
            assistant_id: selectedModel,
            model: assistant?.model || '',
          },
        });

        newConversation({
          template: currentConvo,
          preset: currentConvo,
          keepLatestMessage: true,
        });
        return;
      }

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
      setAssistantId,
      assistantsMap,
    ],
  );

  const handleEndpointSelect = useCallback(
    (ep: string, hasModels: boolean) => {
      if (hasModels) {
        if (conversation?.endpoint !== ep) {
          const newEndpoint = ep as EModelEndpoint;
          const { template } = getConvoSwitchLogic({
            newEndpoint,
            modularChat: false,
            conversation,
            endpointsConfig,
          });

          let initialModel = '';
          let initialAgentId = '';
          let initialAssistantId = '';

          if (newEndpoint === EModelEndpoint.agents && agents.length > 0) {
            initialAgentId = agents[0].id;
          } else if (newEndpoint === EModelEndpoint.assistants && assistants.length > 0) {
            initialAssistantId = assistants[0].id;
            initialModel = assistantsMap[newEndpoint]?.[initialAssistantId]?.model || '';
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
              assistant_id: initialAssistantId,
            },
            preset: {
              ...template,
              endpoint: newEndpoint,
              model: initialModel,
              agent_id: initialAgentId,
              assistant_id: initialAssistantId,
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

      setOpenDropdownFor(null);
    },
    [
      conversation,
      endpointsConfig,
      newConversation,
      getDefaultConversation,
      modelsQuery.data,
      agents,
      assistants,
      assistantsMap,
    ],
  );

  const handleOpenKeyDialog = useCallback(
    (ep: EModelEndpoint, e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setKeyDialogEndpoint(ep);
      setKeyDialogOpen(true);
    },
    [],
  );

  const currentEndpointItem = mappedEndpoints.find((item) => item.value === endpoint);
  const hasModelsOnCurrent = currentEndpointItem?.hasModels;

  const displayValue = endpoint
    ? hasModelsOnCurrent
      ? isAgentsEndpoint(endpoint as string)
        ? agentsMap[selectedAgentId || '']?.name || localize('com_sidepanel_select_agent')
        : isAssistantsEndpoint(endpoint as string)
          ? assistantsMap[endpoint as string]?.[selectedAssistantId || '']?.name ||
            localize('com_sidepanel_select_assistant')
          : conversation?.model || alternateName[endpoint] || endpoint
      : alternateName[endpoint] || endpoint
    : 'Select an endpoint';

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (menuOpen && endpoint && currentEndpointItem?.hasModels) {
      timer = setTimeout(() => {
        setOpenDropdownFor(endpoint);
      }, 50);
    } else if (!menuOpen) {
      setOpenDropdownFor(null);
    }

    return () => {
      clearTimeout(timer);
    };
  }, [menuOpen, endpoint, currentEndpointItem]);

  return (
    <div className="relative">
      <Menu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) {
            setOpenDropdownFor(null);
          }
        }}
        className="animate-popover"
        label={
          <div
            onClick={() => setMenuOpen(!menuOpen)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setMenuOpen(!menuOpen);
              }
            }}
            tabIndex={0}
            role="button"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label={`Select model: ${displayValue}`}
            className={cn(
              'flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
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
                    aria-hidden="true"
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
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-primary"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search endpoints and models"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md bg-surface-secondary py-2 pl-9 pr-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Search endpoints and models"
            />
          </div>
        </div>
        {filteredMenuItems.map((ep) =>
          ep.hasModels ? (
            <Menu
              key={ep.value}
              className="animate-popover-left transition-opacity duration-200 ease-in-out"
              open={openDropdownFor === ep.value}
              onOpenChange={(open) => {
                if (open) {
                  setOpenDropdownFor(ep.value);
                }
              }}
              label={
                <div
                  onClick={() => handleEndpointSelect(ep.value, true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEndpointSelect(ep.value, true);
                    } else if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      setOpenDropdownFor(ep.value);
                    }
                  }}
                  tabIndex={0}
                  role="menuitem"
                  aria-haspopup="true"
                  aria-expanded={openDropdownFor === ep.value}
                  className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-text-primary transition-colors duration-75 hover:bg-surface-tertiary focus:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <div className="flex items-center">
                    {ep.icon && (
                      <div
                        className="mr-2 flex h-5 w-5 items-center justify-center overflow-hidden text-text-primary"
                        aria-hidden="true"
                      >
                        {ep.icon}
                      </div>
                    )}
                    <span className="truncate text-left">{ep.label}</span>
                  </div>
                  <div className="flex items-center">
                    {endpointRequiresUserKey(ep.value) && (
                      <button
                        onClick={(e) => handleOpenKeyDialog(ep.value as EModelEndpoint, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpenKeyDialog(ep.value as EModelEndpoint, e);
                          }
                          // Stop propagation to prevent parent handlers from firing
                          e.stopPropagation();
                        }}
                        className="mr-2 rounded p-1 hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        aria-label={`${localize('com_endpoint_config_key')} for ${ep.label}`}
                      >
                        <Settings className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                      </button>
                    )}
                    <ChevronRight className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                  </div>
                </div>
              }
            >
              {ep.value === EModelEndpoint.agents
                ? (ep.models || []).map((agentId: string) => (
                  <MenuItem
                    key={agentId}
                    onClick={() => handleModelSelect(ep.value as EModelEndpoint, agentId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleModelSelect(ep.value as EModelEndpoint, agentId);
                      }
                      if (e.key === 'ArrowLeft') {
                        // Add navigation back to main menu
                        e.preventDefault();
                        setOpenDropdownFor(null);
                      }
                    }}
                    role="menuitem"
                    tabIndex={0}
                    aria-current={
                      selectedAgentId === agentId && conversation?.endpoint === ep.value
                        ? 'true'
                        : undefined
                    }
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-start rounded-md px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary focus:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                      selectedAgentId === agentId && conversation?.endpoint === ep.value
                        ? 'bg-surface-tertiary'
                        : '',
                    )}
                  >
                    <div
                      className="mr-2 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full"
                      aria-hidden="true"
                    >
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
                : ep.value === EModelEndpoint.assistants
                  ? (ep.models || []).map((assistantId: string) => (
                    <MenuItem
                      key={assistantId}
                      onClick={() => handleModelSelect(ep.value as EModelEndpoint, assistantId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleModelSelect(ep.value as EModelEndpoint, assistantId);
                        }
                        if (e.key === 'ArrowLeft') {
                          // Add navigation back to main menu
                          e.preventDefault();
                          setOpenDropdownFor(null);
                        }
                      }}
                      role="menuitem"
                      tabIndex={0}
                      aria-current={
                        selectedAssistantId === assistantId && conversation?.endpoint === ep.value
                          ? 'true'
                          : undefined
                      }
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-start rounded-md px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary focus:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                        selectedAssistantId === assistantId && conversation?.endpoint === ep.value
                          ? 'bg-surface-tertiary'
                          : '',
                      )}
                    >
                      <div
                        className="mr-2 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full"
                        aria-hidden="true"
                      >
                        <Icon
                          isCreatedByUser={false}
                          endpoint={ep.value}
                          assistantName={ep.assistantNames?.[assistantId] || ''}
                          iconURL={assistantsMap[ep.value]?.[assistantId]?.metadata?.avatar || ''}
                        />
                      </div>
                      {ep.assistantNames?.[assistantId] || assistantId}
                    </MenuItem>
                  ))
                  : (ep.models !== undefined
                    ? ep.models
                    : (modelsQuery.data?.[ep.value] ?? [])
                  ).map((modelName: string) => (
                    <MenuItem
                      key={modelName}
                      onClick={() => handleModelSelect(ep.value as EModelEndpoint, modelName)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleModelSelect(ep.value as EModelEndpoint, modelName);
                        }
                        if (e.key === 'ArrowLeft') {
                          // Add navigation back to main menu
                          e.preventDefault();
                          setOpenDropdownFor(null);
                        }
                      }}
                      role="menuitem"
                      tabIndex={0}
                      aria-current={
                        conversation?.model === modelName && conversation?.endpoint === ep.value
                          ? 'true'
                          : undefined
                      }
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-start rounded-md px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary focus:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                        conversation?.model === modelName && conversation?.endpoint === ep.value
                          ? 'bg-surface-tertiary'
                          : '',
                      )}
                    >
                      {modelName}
                    </MenuItem>
                  ))}
            </Menu>
          ) : (
            <MenuItem
              key={ep.value}
              onClick={() => handleEndpointSelect(ep.value, false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleEndpointSelect(ep.value, false);
                }
              }}
              role="menuitem"
              tabIndex={0}
              aria-current={
                conversation?.endpoint === ep.value && !hasModelsOnCurrent ? 'true' : undefined
              }
              className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-text-primary transition-colors duration-75 hover:bg-surface-tertiary focus:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <div className="flex items-center">
                {ep.icon && (
                  <div
                    className="mr-2 flex h-5 w-5 items-center justify-center overflow-hidden text-text-primary"
                    aria-hidden="true"
                  >
                    {ep.icon}
                  </div>
                )}
                <span>{ep.label}</span>
              </div>
              {endpointRequiresUserKey(ep.value) && (
                <button
                  onClick={(e) => handleOpenKeyDialog(ep.value as EModelEndpoint, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenKeyDialog(ep.value as EModelEndpoint, e);
                    }
                    e.stopPropagation();
                  }}
                  className="rounded p-1 hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={`${localize('com_endpoint_config_key')} for ${ep.label}`}
                >
                  <Settings className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                </button>
              )}
            </MenuItem>
          ),
        )}
      </Menu>
      {keyDialogEndpoint && (
        <SetKeyDialog
          open={keyDialogOpen}
          endpoint={keyDialogEndpoint}
          endpointType={getEndpointField(endpointsConfig, keyDialogEndpoint, 'type')}
          onOpenChange={setKeyDialogOpen}
          userProvideURL={getEndpointField(endpointsConfig, keyDialogEndpoint, 'userProvideURL')}
        />
      )}
    </div>
  );
}

export default memo(ModelDropdown);
