import React from 'react';
import { Settings, ChevronLeft } from 'lucide-react';
import { cn } from '~/utils';
import type { TModelSpec } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';
import Icon from '~/components/Endpoints/Icon';
import ModelItem from './ModelItem';
import SpecItem from './SpecItem';
import { MenuItem } from './Menu';

interface MobileDropdownContentProps {
  currentView: 'endpoints' | 'models';
  modelSpecs?: TModelSpec[];
  filteredMenuItems: any[];
  selectedSpec?: string;
  conversation: any;
  endpointsConfig: any;
  modelSelectEnabled: boolean;
  selectedProvider: string | null;
  selectedProviderData?: any;
  modelsForProvider: any[];
  onSelectSpec: (spec: TModelSpec) => void;
  onSelectEndpoint: (endpoint: string, hasModels: boolean) => void;
  handleModelChoice: (endpoint: EModelEndpoint, modelId: string) => void;
  handleGoBack: () => void;
  endpointRequiresUserKey: (endpoint: string) => boolean;
  handleOpenKeyDialog: (endpoint: EModelEndpoint, e?: React.MouseEvent) => void;
  selectedAgentId?: string;
  selectedAssistantId?: string;
  agentsMap: Record<string, any>;
  assistantsMap: Record<string, any>;
  localize: (key: string) => string;
}

const MobileDropdownContent = ({
  currentView,
  modelSpecs,
  filteredMenuItems,
  selectedSpec,
  conversation,
  endpointsConfig,
  modelSelectEnabled,
  selectedProvider,
  selectedProviderData,
  modelsForProvider,
  onSelectSpec,
  onSelectEndpoint,
  handleModelChoice,
  handleGoBack,
  endpointRequiresUserKey,
  handleOpenKeyDialog,
  selectedAgentId,
  selectedAssistantId,
  agentsMap,
  assistantsMap,
  localize,
}: MobileDropdownContentProps) => {
  return (
    <div className="min-h-[300px] w-full">
      {/* Endpoints List View */}
      <div
        className={cn(
          'transform transition-all duration-300 ease-in-out',
          currentView === 'models'
            ? 'pointer-events-none h-0 overflow-hidden opacity-0'
            : 'pointer-events-auto opacity-100',
        )}
      >
        {modelSpecs && modelSpecs.length > 0
          ? filteredMenuItems.map((spec: TModelSpec) => (
            <React.Fragment key={`spec-${spec.name}`}>
              <SpecItem
                spec={spec}
                isSelected={selectedSpec === spec.name}
                endpointsConfig={endpointsConfig}
                onSelect={onSelectSpec}
              />
            </React.Fragment>
          ))
          : filteredMenuItems.map((ep) => (
            <MenuItem
              key={ep.value}
              onClick={() =>
                onSelectEndpoint(ep.value, ep.hasModels && modelSelectEnabled !== false)
              }
              role="menuitem"
              tabIndex={0}
              aria-current={
                conversation?.endpoint === ep.value && !ep.hasModels ? 'true' : undefined
              }
              className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-3 text-base text-text-primary transition-colors duration-75 hover:bg-surface-tertiary focus:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <div className="flex items-center">
                {ep.icon && (
                  <div
                    className="mr-3 flex h-6 w-6 items-center justify-center overflow-hidden text-text-primary"
                    aria-hidden="true"
                  >
                    {ep.icon}
                  </div>
                )}
                <span>{ep.label}</span>
              </div>
              {endpointRequiresUserKey(ep.value) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenKeyDialog(ep.value as EModelEndpoint, e);
                  }}
                  className="rounded p-2 hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={`${localize('com_endpoint_config_key')} for ${ep.label}`}
                >
                  <Settings className="h-5 w-5 text-text-secondary" aria-hidden="true" />
                </button>
              )}
            </MenuItem>
          ))}
      </div>

      {/* Models List View */}
      <div
        className={cn(
          'transform transition-all duration-300 ease-in-out',
          currentView === 'endpoints'
            ? 'pointer-events-none h-0 overflow-hidden opacity-0'
            : 'pointer-events-auto opacity-100',
        )}
      >
        {currentView === 'models' && selectedProviderData && selectedProvider && (
          <>
            <div className="mb-2 border-b border-border-light">
              <MenuItem
                onClick={handleGoBack}
                className="flex w-full cursor-pointer items-center px-3 py-3 text-base text-text-primary transition-colors duration-75 hover:bg-surface-tertiary focus:bg-surface-tertiary"
              >
                <ChevronLeft className="mr-2 h-5 w-5" />
                <span>{localize('com_ui_go_back')}</span>
              </MenuItem>
            </div>

            {selectedProvider === EModelEndpoint.agents
              ? modelsForProvider.map((agentId: string) => (
                <ModelItem
                  key={agentId}
                  modelName={selectedProviderData.agentNames?.[agentId] || agentId}
                  endpoint={EModelEndpoint.agents}
                  isSelected={
                    selectedAgentId === agentId && conversation?.endpoint === selectedProvider
                  }
                  onSelect={() => handleModelChoice(EModelEndpoint.agents, agentId)}
                  onNavigateBack={handleGoBack}
                  className="py-3 text-base"
                  icon={
                    <Icon
                      isCreatedByUser={false}
                      endpoint={selectedProvider}
                      agentName={selectedProviderData.agentNames?.[agentId] || ''}
                      iconURL={agentsMap[agentId]?.avatar?.filepath}
                      className="mr-3 h-6 w-6"
                    />
                  }
                />
              ))
              : selectedProvider === EModelEndpoint.assistants
                ? modelsForProvider.map((assistantId: string) => (
                  <ModelItem
                    key={assistantId}
                    modelName={selectedProviderData.assistantNames?.[assistantId] || assistantId}
                    endpoint={EModelEndpoint.assistants}
                    isSelected={
                      selectedAssistantId === assistantId &&
                        conversation?.endpoint === selectedProvider
                    }
                    onSelect={() => handleModelChoice(EModelEndpoint.assistants, assistantId)}
                    onNavigateBack={handleGoBack}
                    className="py-3 text-base"
                    icon={
                      <Icon
                        isCreatedByUser={false}
                        endpoint={selectedProvider}
                        assistantName={selectedProviderData.assistantNames?.[assistantId] || ''}
                        iconURL={
                          assistantsMap[selectedProvider]?.[assistantId]?.metadata?.avatar || ''
                        }
                        className="mr-3 h-6 w-6"
                      />
                    }
                  />
                ))
                : modelsForProvider.map((modelName: string) => (
                  <ModelItem
                    key={modelName}
                    modelName={modelName}
                    endpoint={selectedProvider as EModelEndpoint}
                    className="py-3 text-base"
                    isSelected={
                      conversation?.model === modelName &&
                        conversation?.endpoint === selectedProvider
                    }
                    onSelect={() =>
                      handleModelChoice(selectedProvider as EModelEndpoint, modelName)
                    }
                    onNavigateBack={handleGoBack}
                  />
                ))}
          </>
        )}
      </div>
    </div>
  );
};

export default MobileDropdownContent;
