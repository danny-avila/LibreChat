import React, { useMemo, memo, useRef, useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import {
  EModelEndpoint,
  alternateName,
  isAgentsEndpoint,
  isAssistantsEndpoint,
  Agent,
} from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { useDefaultConvo, useSetIndexOptions, useLocalize, useAssistantListMap } from '~/hooks';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useEndpoints, useModelSelection, useKeyDialog } from '~/hooks';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { useGetEndpointsQuery } from '~/data-provider';
import Icon from '~/components/Endpoints/Icon';
import { filterMenuItems } from '~/utils';
import EndpointItem from './EndpointItem';
import { Menu, MenuItem } from './menu';
import SearchBar from './SearchBar';
import ModelItem from './ModelItem';
import { cn } from '~/utils';
import store from '~/store';

const getEndpointField = (
  config: Record<string, any> | undefined,
  endpoint: string,
  field: string,
) => {
  return config?.[endpoint]?.[field];
};

export function ModelDropdown(): JSX.Element {
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const modelsQuery = useGetModelsQuery();
  const { conversation, newConversation, index } = useChatContext();
  const { setOption } = useSetIndexOptions();
  const timeoutIdRef = useRef<NodeJS.Timeout>();
  const getDefaultConversation = useDefaultConvo();
  const localize = useLocalize();

  const {
    endpoint,
    agent_id: selectedAgentId,
    assistant_id: selectedAssistantId,
  } = conversation ?? {};

  const agentsMapResult = useAgentsMapContext();
  const agentsMap = useMemo(() => {
    return agentsMapResult ?? {};
  }, [agentsMapResult]);

  const agents = useMemo(() => {
    return Object.values(agentsMap).filter(
      (agent): agent is Agent & { name: string } =>
        agent !== undefined && 'id' in agent && 'name' in agent && agent.name !== null,
    );
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

  const modularChat = useRecoilValue(store.modularChat);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDropdownFor, setOpenDropdownFor] = useState<string | null>(null);

  const { mappedEndpoints, endpointRequiresUserKey } = useEndpoints(
    endpointsConfig,
    agents,
    assistants,
    modelsQuery,
  );

  const { handleModelSelect, handleEndpointSelect } = useModelSelection(
    conversation,
    setOption,
    index,
    getDefaultConversation,
    newConversation,
    endpointsConfig,
    modularChat,
    assistantsMap,
    timeoutIdRef,
  );

  const { keyDialogOpen, keyDialogEndpoint, setKeyDialogOpen, handleOpenKeyDialog } =
    useKeyDialog();

  const filteredMenuItems = useMemo(() => {
    return filterMenuItems(searchTerm, mappedEndpoints, agents, assistants, modelsQuery.data);
  }, [searchTerm, mappedEndpoints, agents, assistants, modelsQuery.data]);

  const onSelectEndpoint = (ep: string, hasModels: boolean) => {
    handleEndpointSelect(ep, hasModels, agents, assistants, modelsQuery.data);
    if (!hasModels) {
      setOpenDropdownFor(null);
    }
  };

  const currentEndpointItem = mappedEndpoints.find((item) => item.value === endpoint);
  const hasModelsOnCurrent = currentEndpointItem?.hasModels;

  const displayValue = useMemo(() => {
    if (!endpoint) {
      return 'Select an endpoint';
    }

    if (hasModelsOnCurrent) {
      if (isAgentsEndpoint(endpoint as string)) {
        return agentsMap[selectedAgentId || '']?.name || localize('com_sidepanel_select_agent');
      }
      if (isAssistantsEndpoint(endpoint as string)) {
        return (
          assistantsMap[endpoint as string]?.[selectedAssistantId || '']?.name ||
          localize('com_sidepanel_select_assistant')
        );
      }
      return conversation?.model || alternateName[endpoint] || endpoint;
    }

    return alternateName[endpoint] || endpoint;
  }, [
    endpoint,
    hasModelsOnCurrent,
    selectedAgentId,
    selectedAssistantId,
    agentsMap,
    assistantsMap,
    conversation?.model,
    localize,
  ]);

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
        <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

        {filteredMenuItems.map((ep) =>
          ep.hasModels ? (
            <Menu
              key={ep.value}
              className="animate-popover-left transition-opacity duration-200 ease-in-out"
              open={openDropdownFor === ep.value}
              onOpenChange={(open: boolean) => {
                if (open) {
                  setOpenDropdownFor(ep.value);
                }
              }}
              label={
                <EndpointItem
                  endpoint={ep.value}
                  label={ep.label}
                  icon={ep.icon}
                  hasModels={ep.hasModels}
                  isSelected={openDropdownFor === ep.value}
                  requiresUserKey={endpointRequiresUserKey(ep.value)}
                  onSelect={() => onSelectEndpoint(ep.value, true)}
                  onOpenKeyDialog={handleOpenKeyDialog}
                  onOpenDropdown={setOpenDropdownFor}
                />
              }
            >
              {ep.value === EModelEndpoint.agents
                ? (ep.models || []).map((agentId: string) => (
                  <ModelItem
                    key={agentId}
                    modelName={ep.agentNames?.[agentId] || agentId}
                    endpoint={ep.value}
                    isSelected={
                      selectedAgentId === agentId && conversation?.endpoint === ep.value
                    }
                    onSelect={() => handleModelSelect(ep.value, agentId)}
                    onNavigateBack={() => setOpenDropdownFor(null)}
                    icon={
                      <Icon
                        isCreatedByUser={false}
                        endpoint={ep.value}
                        agentName={ep.agentNames?.[agentId] || ''}
                        iconURL={agentsMap[agentId]?.avatar?.filepath}
                      />
                    }
                  />
                ))
                : ep.value === EModelEndpoint.assistants
                  ? (ep.models || []).map((assistantId: string) => (
                    <ModelItem
                      key={assistantId}
                      modelName={ep.assistantNames?.[assistantId] || assistantId}
                      endpoint={ep.value}
                      isSelected={
                        selectedAssistantId === assistantId && conversation?.endpoint === ep.value
                      }
                      onSelect={() => handleModelSelect(ep.value, assistantId)}
                      onNavigateBack={() => setOpenDropdownFor(null)}
                      icon={
                        <Icon
                          isCreatedByUser={false}
                          endpoint={ep.value}
                          assistantName={ep.assistantNames?.[assistantId] || ''}
                          iconURL={assistantsMap[ep.value]?.[assistantId]?.metadata?.avatar || ''}
                        />
                      }
                    />
                  ))
                  : (ep.models !== undefined
                    ? ep.models
                    : (modelsQuery.data?.[ep.value] ?? [])
                  ).map((modelName: string) => (
                    <ModelItem
                      key={modelName}
                      modelName={modelName}
                      endpoint={ep.value}
                      isSelected={
                        conversation?.model === modelName && conversation?.endpoint === ep.value
                      }
                      onSelect={() => handleModelSelect(ep.value, modelName)}
                      onNavigateBack={() => setOpenDropdownFor(null)}
                    />
                  ))}
            </Menu>
          ) : (
            <MenuItem
              key={ep.value}
              onClick={() => onSelectEndpoint(ep.value, false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectEndpoint(ep.value, false);
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
