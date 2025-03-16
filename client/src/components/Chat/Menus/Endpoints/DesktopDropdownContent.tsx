import React from 'react';
import { Settings } from 'lucide-react';
import type { TModelSpec } from 'librechat-data-provider';
import { EModelEndpoint, isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import Icon from '~/components/Endpoints/Icon';
import EndpointItem from './EndpointItem';
import { Menu, MenuItem } from './Menu';
import ModelItem from './ModelItem';
import SpecItem from './SpecItem';

interface DesktopDropdownContentProps {
  modelSpecs?: TModelSpec[];
  filteredMenuItems: any[];
  selectedSpec?: string;
  conversation: any;
  endpointsConfig: any;
  modelSelectEnabled: boolean;
  selectedProvider: string | null;
  setSelectedProvider: (provider: string | null) => void;
  onSelectSpec: (spec: TModelSpec) => void;
  onSelectEndpoint: (endpoint: string, hasModels: boolean) => void;
  handleModelSelect: (endpoint: EModelEndpoint, modelId: string) => void;
  endpointRequiresUserKey: (endpoint: string) => boolean;
  handleOpenKeyDialog: (endpoint: EModelEndpoint, e?: React.MouseEvent) => void;
  selectedAgentId?: string;
  selectedAssistantId?: string;
  agentsMap: Record<string, any>;
  assistantsMap: Record<string, any>;
  modelsQuery: any;
  localize: (key: string) => string;
}

const DesktopDropdownContent = ({
  modelSpecs,
  filteredMenuItems,
  selectedSpec,
  conversation,
  endpointsConfig,
  modelSelectEnabled,
  selectedProvider,
  setSelectedProvider,
  onSelectSpec,
  onSelectEndpoint,
  handleModelSelect,
  endpointRequiresUserKey,
  handleOpenKeyDialog,
  selectedAgentId,
  selectedAssistantId,
  agentsMap,
  assistantsMap,
  modelsQuery,
  localize,
}: DesktopDropdownContentProps) => {
  return (
    <>
      {modelSpecs && modelSpecs.length > 0
        ? filteredMenuItems.map((spec: TModelSpec, i: number) => (
          <React.Fragment key={`spec-${spec.name}`}>
            <SpecItem
              spec={spec}
              isSelected={selectedSpec === spec.name}
              endpointsConfig={endpointsConfig}
              onSelect={onSelectSpec}
            />
          </React.Fragment>
        ))
        : filteredMenuItems.map((ep) =>
          ep.hasModels && modelSelectEnabled !== false ? (
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
                  onSelect={() => onSelectEndpoint(ep.value, modelSelectEnabled)}
                  onOpenKeyDialog={handleOpenKeyDialog}
                  onOpenDropdown={setSelectedProvider}
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
                        selectedAssistantId === assistantId &&
                            conversation?.endpoint === ep.value
                      }
                      onSelect={() => handleModelSelect(ep.value, assistantId)}
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
                      endpoint={ep.value}
                      isSelected={
                        conversation?.model === modelName && conversation?.endpoint === ep.value
                      }
                      onSelect={() => handleModelSelect(ep.value, modelName)}
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
