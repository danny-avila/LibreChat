import React from 'react';
import { ChevronLeft, Settings } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import Icon from '~/components/Endpoints/Icon';
import { MenuItem } from './Menu';
import ModelItem from './ModelItem';
import SearchBar from './SearchBar';
import SpecItem from './SpecItem';
import type { ExtendedEndpoint } from '~/common';

interface MobileDropdownContentProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  currentView: 'endpoints' | 'models';
  modelSpecs?: TModelSpec[];
  filteredMenuItems: TModelSpec[] | ExtendedEndpoint[];
  selectedSpec?: string;
  endpointsConfig: Record<string, any>;
  onSelectSpec: (spec: TModelSpec) => void;
  onSelectEndpoint: (ep: EModelEndpoint, hasModels: boolean) => void;
  endpointRequiresUserKey: (endpoint: string) => boolean;
  handleOpenKeyDialog: (endpoint: EModelEndpoint, e: React.MouseEvent) => void;
  handleGoBack: (e?: React.MouseEvent) => void;
  handleModelChoice: (ep: EModelEndpoint, modelId: string) => void;
  conversation: any;
  selectedProvider: EModelEndpoint | null;
  selectedProviderData?: ExtendedEndpoint;
  modelsForProvider: string[];
  selectedAgentId?: string;
  selectedAssistantId?: string;
  agentsMap: Record<string, any>;
  assistantsMap: Record<string, Record<string, any>>;
  modelSelectEnabled: boolean;
  hasModelsOnCurrent?: boolean;
  modelsQuery: any;
}

const MobileDropdownContent: React.FC<MobileDropdownContentProps> = ({
  searchTerm,
  setSearchTerm,
  currentView,
  modelSpecs,
  filteredMenuItems,
  selectedSpec,
  endpointsConfig,
  onSelectSpec,
  onSelectEndpoint,
  endpointRequiresUserKey,
  handleOpenKeyDialog,
  handleGoBack,
  handleModelChoice,
  conversation,
  selectedProvider,
  selectedProviderData,
  modelsForProvider,
  selectedAgentId,
  selectedAssistantId,
  agentsMap,
  assistantsMap,
  modelSelectEnabled,
  hasModelsOnCurrent,
  modelsQuery,
}) => {
  const localize = useLocalize();

  return (
    <div className="relative w-full">
      <SearchBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        className={cn(currentView === 'models' && 'hidden')}
      />
      <div
        className={cn(
          'w-full transform transition-all duration-300 ease-in-out',
          currentView === 'models'
            ? 'pointer-events-none absolute h-0 -translate-x-full overflow-hidden opacity-0'
            : 'pointer-events-auto relative max-h-[70vh] translate-x-0 overflow-y-auto opacity-100',
        )}
      >
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
          : (filteredMenuItems as ExtendedEndpoint[]).map((ep: ExtendedEndpoint) => (
            <MenuItem
              key={ep.value}
              onClick={() =>
                onSelectEndpoint(ep.value, ep.hasModels && modelSelectEnabled !== false)
              }
              hideOnClick={!(ep.hasModels && modelSelectEnabled)}
              role="menuitem"
              tabIndex={0}
              aria-current={
                conversation?.endpoint === ep.value && !hasModelsOnCurrent ? 'true' : undefined
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
      {/* Mobile models view */}
      <div
        className={cn(
          'w-full transform transition-all duration-300 ease-in-out',
          currentView === 'endpoints'
            ? 'pointer-events-none absolute h-0 translate-x-full overflow-hidden opacity-0'
            : 'pointer-events-auto relative translate-x-0 opacity-100',
        )}
      >
        {currentView === 'models' && selectedProviderData ? (
          <>
            <div className="sticky top-0 z-10 bg-surface-secondary">
              <MenuItem
                onClick={handleGoBack}
                className="flex w-full cursor-pointer items-center border-b border-border-light px-3 py-3 text-base text-text-primary transition-colors duration-75 hover:bg-surface-tertiary focus:bg-surface-tertiary"
              >
                <ChevronLeft className="mr-2 h-5 w-5" />
                <span>{localize('com_ui_go_back')}</span>
              </MenuItem>
            </div>
            <div className="mt-2 overflow-y-auto">
              {modelsQuery.isLoading ? (
                <div className="px-3 py-3 text-center text-text-primary">
                  {localize('com_ui_loading')}
                </div>
              ) : modelsForProvider.length === 0 ? (
                <div className="px-3 py-3 text-center text-text-primary">
                  {searchTerm
                    ? localize('com_ui_no_matching_models')
                    : localize('com_ui_no_models_available')}
                </div>
              ) : selectedProvider === EModelEndpoint.agents ? (
                modelsForProvider.map((agentId: string) => (
                  <ModelItem
                    key={agentId}
                    modelName={selectedProviderData.agentNames?.[agentId] || agentId}
                    endpoint={selectedProvider as EModelEndpoint}
                    isSelected={
                      selectedAgentId === agentId && conversation?.endpoint === selectedProvider
                    }
                    onSelect={() => handleModelChoice(selectedProvider, agentId)}
                    onNavigateBack={handleGoBack}
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
              ) : selectedProvider === EModelEndpoint.assistants ? (
                modelsForProvider.map((assistantId: string) => (
                  <ModelItem
                    key={assistantId}
                    modelName={selectedProviderData.assistantNames?.[assistantId] || assistantId}
                    endpoint={selectedProvider as EModelEndpoint}
                    isSelected={
                      selectedAssistantId === assistantId &&
                      conversation?.endpoint === selectedProvider
                    }
                    onSelect={() => handleModelChoice(selectedProvider, assistantId)}
                    onNavigateBack={handleGoBack}
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
              ) : (
                modelsForProvider.map((modelName: string) => (
                  <ModelItem
                    key={modelName}
                    modelName={modelName}
                    endpoint={selectedProvider as EModelEndpoint}
                    isSelected={
                      conversation?.model === modelName &&
                      conversation?.endpoint === selectedProvider
                    }
                    onSelect={() => handleModelChoice(selectedProvider!, modelName)}
                    onNavigateBack={handleGoBack}
                  />
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default MobileDropdownContent;
