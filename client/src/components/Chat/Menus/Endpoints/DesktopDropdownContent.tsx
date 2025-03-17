import React from 'react';
import { Settings } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelSpec, Agent } from 'librechat-data-provider';
import type { ExtendedEndpoint } from '~/common';
import Icon from '~/components/Endpoints/Icon';
import EndpointItem from './EndpointItem';
import { Menu, MenuItem } from './Menu';
import { useLocalize } from '~/hooks';
import ModelItem from './ModelItem';
import SearchBar from './SearchBar';
import SpecItem from './SpecItem';

interface DesktopDropdownContentProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  modelSpecs?: TModelSpec[];
  filteredMenuItems: TModelSpec[] | ExtendedEndpoint[];
  selectedSpec?: string;
  endpointsConfig: Record<string, any>;
  selectedProvider: EModelEndpoint | null;
  setSelectedProvider: (provider: EModelEndpoint) => void;
  onSelectSpec: (spec: TModelSpec) => void;
  onSelectEndpoint: (ep: EModelEndpoint, hasModels: boolean) => void;
  endpointRequiresUserKey: (endpoint: string) => boolean;
  handleOpenKeyDialog: (
    endpoint: EModelEndpoint,
    e: React.MouseEvent | React.KeyboardEvent,
  ) => void;
  handleModelSelect: (endpoint: EModelEndpoint, modelId: string) => void;
  conversation: any;
  selectedAgentId?: string;
  selectedAssistantId?: string;
  agentsMap: Record<string, Agent>;
  assistantsMap: Record<string, Record<string, any>>;
  modelsQuery: any;
}

const DesktopDropdownContent: React.FC<DesktopDropdownContentProps> = ({
  searchTerm,
  setSearchTerm,
  modelSpecs,
  filteredMenuItems,
  selectedSpec,
  endpointsConfig,
  selectedProvider,
  setSelectedProvider,
  onSelectSpec,
  onSelectEndpoint,
  endpointRequiresUserKey,
  handleOpenKeyDialog,
  handleModelSelect,
  conversation,
  selectedAgentId,
  selectedAssistantId,
  agentsMap,
  assistantsMap,
  modelsQuery,
}) => {
  const localize = useLocalize();

  return (
    <>
      <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      {modelSpecs && modelSpecs.length > 0
        ? (filteredMenuItems as TModelSpec[]).map((spec: TModelSpec) => (
          <React.Fragment key={`spec-${spec.name}`}>
            <SpecItem
              spec={spec}
              isSelected={selectedSpec === spec.name}
              endpointsConfig={endpointsConfig}
              onSelect={onSelectSpec}
            />
          </React.Fragment>
        ))
        : (filteredMenuItems as ExtendedEndpoint[]).map((ep: ExtendedEndpoint) =>
          ep.hasModels ? (
            <Menu
              key={ep.value}
              className="animate-popover-left transition-opacity duration-200 ease-in-out"
              open={ep.value === selectedProvider}
              onOpenChange={(open: boolean) => {
                if (open) {
                  setSelectedProvider(ep.value);
                }
              }}
              label={
                <EndpointItem
                  endpoint={ep.value}
                  label={ep.label}
                  icon={ep.icon}
                  hasModels={ep.hasModels}
                  isSelected={ep.value === selectedProvider}
                  requiresUserKey={endpointRequiresUserKey(ep.value)}
                  onSelect={() => onSelectEndpoint(ep.value, true)}
                  onOpenKeyDialog={handleOpenKeyDialog}
                  onOpenDropdown={(endpoint) => setSelectedProvider(endpoint as EModelEndpoint)}
                />
              }
            >
              {ep.value === EModelEndpoint.agents
                ? (ep.models || []).map((agentId: string) => (
                  <ModelItem
                    key={agentId}
                    modelName={ep.agentNames?.[agentId] || agentId}
                    endpoint={ep.value as EModelEndpoint}
                    isSelected={
                      selectedAgentId === agentId && conversation?.endpoint === ep.value
                    }
                    onSelect={() => handleModelSelect(ep.value as EModelEndpoint, agentId)}
                    onNavigateBack={() => {}}
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
                      endpoint={ep.value as EModelEndpoint}
                      isSelected={
                        selectedAssistantId === assistantId &&
                            conversation?.endpoint === ep.value
                      }
                      onSelect={() =>
                        handleModelSelect(ep.value as EModelEndpoint, assistantId)
                      }
                      onNavigateBack={() => {}}
                      icon={
                        <Icon
                          isCreatedByUser={false}
                          endpoint={ep.value}
                          assistantName={ep.assistantNames?.[assistantId] || ''}
                          iconURL={
                            assistantsMap[ep.value]?.[assistantId]?.metadata?.avatar || ''
                          }
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
                      endpoint={ep.value as EModelEndpoint}
                      isSelected={
                        conversation?.model === modelName && conversation?.endpoint === ep.value
                      }
                      onSelect={() => handleModelSelect(ep.value as EModelEndpoint, modelName)}
                      onNavigateBack={() => {}}
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
                conversation?.endpoint === ep.value && !ep.hasModels ? 'true' : undefined
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
    </>
  );
};

export default DesktopDropdownContent;
