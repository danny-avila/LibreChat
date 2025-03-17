import React, { useMemo, memo, useRef, useState, useEffect } from 'react';
import { Settings, ChevronLeft } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import {
  EModelEndpoint,
  alternateName,
  isAgentsEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import type { TModelSpec, TInterfaceConfig, Agent, TConversation } from 'librechat-data-provider';
import {
  useDefaultConvo,
  useSetIndexOptions,
  useLocalize,
  useAssistantListMap,
  useEndpoints,
  useModelSelection,
  useKeyDialog,
  useMediaQuery,
} from '~/hooks';
import { cn, getModelSpecIconURL, filterMenuItems, getConvoSwitchLogic } from '~/utils';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useGetEndpointsQuery } from '~/data-provider';
import type { ExtendedEndpoint } from '~/common';
import Icon from '~/components/Endpoints/Icon';
import DialogManager from './DialogManager';
import EndpointItem from './EndpointItem';
import { Menu, MenuItem } from './Menu';
import ModelItem from './ModelItem';
import SearchBar from './SearchBar';
import SpecItem from './SpecItem';
import SpecIcon from './SpecIcon';
import store from '~/store';

interface EndpointMenuDropdownProps {
  interfaceConfig: TInterfaceConfig;
  modelSpecs?: TModelSpec[];
}

export function EndpointMenuDropdown({ interfaceConfig, modelSpecs }: EndpointMenuDropdownProps) {
  const localize = useLocalize();
  const modelsQuery = useGetModelsQuery();
  const { setOption } = useSetIndexOptions();
  const timeoutIdRef = useRef<NodeJS.Timeout>();
  const closeTimeoutRef = useRef<NodeJS.Timeout>();
  const getDefaultConversation = useDefaultConvo();
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const { conversation, newConversation, index } = useChatContext();
  const endpointsMenuEnabled = interfaceConfig?.endpointsMenu ?? false;
  const modelSelectEnabled = interfaceConfig?.modelSelect ?? false;
  const isMobile = useMediaQuery('(max-width: 640px)');

  const {
    endpoint,
    agent_id: selectedAgentId,
    assistant_id: selectedAssistantId,
    spec: selectedSpec,
  } = conversation ?? {};

  const agentsMapResult = useAgentsMapContext();
  const agentsMap = useMemo(() => agentsMapResult ?? {}, [agentsMapResult]);
  const agents = useMemo(
    () =>
      Object.values(agentsMap).filter(
        (agent): agent is Agent & { name: string } =>
          agent !== undefined && 'id' in agent && 'name' in agent && agent.name !== null,
      ),
    [agentsMap],
  );

  const assistantListMap = useAssistantListMap((res) =>
    res.data.map(({ id, name, metadata, model }) => ({ id, name, metadata, model })),
  );
  const assistantsMapResult = useAssistantsMapContext();
  const assistantsMap = useMemo(() => assistantsMapResult ?? {}, [assistantsMapResult]);
  const assistants = useMemo(
    () => assistantListMap[endpoint as string] ?? [],
    [endpoint, assistantListMap],
  );

  const modularChat = useRecoilValue(store.modularChat);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState<'endpoints' | 'models'>('endpoints');
  const [selectedProvider, setSelectedProvider] = useState<EModelEndpoint | null>(null);
  const animationTimeoutRef = useRef<NodeJS.Timeout>();
  const openingAnimationRef = useRef<NodeJS.Timeout>();

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

  const onSelectSpec = (spec: TModelSpec) => {
    const { preset } = spec;
    preset.iconURL = getModelSpecIconURL(spec);
    preset.spec = spec.name;
    const { endpoint } = preset;
    const newEndpoint = endpoint ?? '';
    if (!newEndpoint) {
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
      newEndpoint,
      modularChat,
      conversation,
      endpointsConfig,
    });

    if (newEndpointType) {
      preset.endpointType = newEndpointType;
    }

    if (isAssistantsEndpoint(newEndpoint) && preset.assistant_id != null && !(preset.model ?? '')) {
      preset.model = assistantsMap?.[newEndpoint]?.[preset.assistant_id]?.model;
    }

    const isModular = isCurrentModular && isNewModular && shouldSwitch;
    if (isExistingConversation && isModular) {
      template.endpointType = newEndpointType as EModelEndpoint | undefined;
      const currentConvo = getDefaultConversation({
        conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
        preset: template,
      });
      newConversation({
        template: currentConvo,
        preset,
        keepLatestMessage: true,
        keepAddedConvos: true,
      });
      setMenuOpen(false);
      return;
    }

    newConversation({
      template: { ...(template as Partial<TConversation>) },
      preset,
      keepAddedConvos: isModular,
    });
    setMenuOpen(false);
  };

  const filteredMenuItems = useMemo<TModelSpec[] | ExtendedEndpoint[]>(() => {
    if (modelSpecs && modelSpecs.length > 0) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      return modelSpecs.filter(
        (spec) =>
          spec.label.toLowerCase().includes(lowerSearchTerm) ||
          spec.description?.toLowerCase().includes(lowerSearchTerm),
      );
    }
    return filterMenuItems(searchTerm, mappedEndpoints, agents, assistants, modelsQuery.data);
  }, [searchTerm, mappedEndpoints, agents, assistants, modelsQuery.data, modelSpecs]);

  const onSelectEndpoint = (ep: EModelEndpoint, hasModels: boolean) => {
    setSelectedProvider(ep);
    if (hasModels && isMobile) {
      setCurrentView('models');
    } else {
      handleEndpointSelect(ep, hasModels, agents, assistants, modelsQuery.data);
      setMenuOpen(false);
    }
  };

  const handleModelChoice = (ep: EModelEndpoint, modelId: string) => {
    if (ep) {
      handleModelSelect(ep, modelId);
      setMenuOpen(false);
      setCurrentView('endpoints');
    }
  };

  const handleGoBack = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setCurrentView('endpoints');
  };

  const currentEndpointItem = mappedEndpoints.find((item) => item.value === endpoint);
  const hasModelsOnCurrent = currentEndpointItem?.hasModels;

  const currentModelSpec = modelSpecs?.find((spec) => spec.name === selectedSpec);

  const displayValue = useMemo(() => {
    if (currentModelSpec) {
      return currentModelSpec.label;
    }
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
    currentModelSpec,
    selectedSpec,
  ]);

  useEffect(() => {
    if (menuOpen) {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = undefined;
      }
      if (openingAnimationRef.current) {
        clearTimeout(openingAnimationRef.current);
        openingAnimationRef.current = undefined;
      }
      setCurrentView('endpoints');
      if (endpoint && hasModelsOnCurrent && !isMobile) {
        openingAnimationRef.current = setTimeout(() => {
          setSelectedProvider(endpoint);
        }, 50);
      } else {
        setSelectedProvider(null);
      }
    } else {
      setSelectedProvider(null);
      setCurrentView('endpoints');
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = undefined;
      }
      if (openingAnimationRef.current) {
        clearTimeout(openingAnimationRef.current);
        openingAnimationRef.current = undefined;
      }
    }

    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      if (openingAnimationRef.current) {
        clearTimeout(openingAnimationRef.current);
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [menuOpen, endpoint, hasModelsOnCurrent, isMobile]);

  if (endpointsMenuEnabled === false && modelSpecs?.length === 0) {
    return <></>;
  }

  const getModelsForProvider = (provider: EModelEndpoint) => {
    const ep = mappedEndpoints.find((e) => e.value === provider);
    if (!ep) {
      return [];
    }

    let models: string[] = [];

    if (provider === EModelEndpoint.agents) {
      models = ep.models || [];
    } else if (provider === EModelEndpoint.assistants) {
      models = ep.models || [];
    } else {
      models = ep.models !== undefined ? ep.models : (modelsQuery.data?.[provider] ?? []);
    }

    // Apply search filtering to models
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      if (provider === EModelEndpoint.agents) {
        return models.filter((agentId) =>
          (ep.agentNames?.[agentId] || agentId).toLowerCase().includes(lowerSearchTerm),
        );
      } else if (provider === EModelEndpoint.assistants) {
        return models.filter((assistantId) =>
          (ep.assistantNames?.[assistantId] || assistantId).toLowerCase().includes(lowerSearchTerm),
        );
      } else {
        return models.filter((modelName) => modelName.toLowerCase().includes(lowerSearchTerm));
      }
    }

    return models;
  };

  const selectedProviderData = mappedEndpoints.find((e) => e.value === selectedProvider);
  const modelsForProvider = selectedProvider ? getModelsForProvider(selectedProvider) : [];

  return (
    <div className="relative">
      <Menu
        open={menuOpen}
        onOpenChange={(open) => setMenuOpen(open)}
        className={cn('animate-popover', isMobile && 'w-full max-w-full')}
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
            {currentModelSpec ? (
              <div className="flex h-5 w-5 items-center justify-center overflow-hidden text-text-primary">
                <SpecIcon currentSpec={currentModelSpec} endpointsConfig={endpointsConfig} />
              </div>
            ) : (
              currentEndpointItem &&
              currentEndpointItem.icon && (
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center overflow-hidden text-text-primary',
                    isAgentsEndpoint(endpoint as string) && selectedAgentId ? 'rounded-full' : '',
                    isMobile && 'h-6 w-6',
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
              )
            )}
            <span className="flex-grow truncate text-left">{displayValue}</span>
          </div>
        }
      >
        {!isMobile ? (
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
                        onOpenDropdown={(endpoint) =>
                          setSelectedProvider(endpoint as EModelEndpoint)
                        }
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
                          onSelect={() =>
                            handleModelSelect(ep.value as EModelEndpoint, agentId)
                          }
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
                              conversation?.model === modelName &&
                                  conversation?.endpoint === ep.value
                            }
                            onSelect={() =>
                              handleModelSelect(ep.value as EModelEndpoint, modelName)
                            }
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
                      conversation?.endpoint === ep.value && !hasModelsOnCurrent
                        ? 'true'
                        : undefined
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
        ) : (
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
                    hideOnClick={!(ep.hasModels && modelSelectEnabled && isMobile)}
                    role="menuitem"
                    tabIndex={0}
                    aria-current={
                      conversation?.endpoint === ep.value && !hasModelsOnCurrent
                        ? 'true'
                        : undefined
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
                            selectedAgentId === agentId &&
                            conversation?.endpoint === selectedProvider
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
                          modelName={
                            selectedProviderData.assistantNames?.[assistantId] || assistantId
                          }
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
                              assistantName={
                                selectedProviderData.assistantNames?.[assistantId] || ''
                              }
                              iconURL={
                                assistantsMap[selectedProvider]?.[assistantId]?.metadata?.avatar ||
                                ''
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
        )}
      </Menu>
      <DialogManager
        keyDialogOpen={keyDialogOpen}
        keyDialogEndpoint={keyDialogEndpoint ?? undefined}
        setKeyDialogOpen={setKeyDialogOpen}
        endpointsConfig={endpointsConfig}
      />
    </div>
  );
}

export default memo(EndpointMenuDropdown);
