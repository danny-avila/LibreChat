import React, { useMemo, memo, useRef, useState, useEffect } from 'react';
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
import DesktopDropdownContent from './DesktopDropdownContent';
import MobileDropdownContent from './MobileDropdownContent';
import ModelDropdownButton from './ModelDropdownButton';
import { useGetEndpointsQuery } from '~/data-provider';
import type { ExtendedEndpoint } from '~/common';
import DialogManager from './DialogManager';
import { Menu } from './Menu';
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

  const agentsMap = useMemo(() => {
    const result: Record<string, Agent> = {};
    if (agentsMapResult) {
      Object.entries(agentsMapResult).forEach(([key, agent]) => {
        if (agent !== undefined) {
          result[key] = agent;
        }
      });
    }
    return result;
  }, [agentsMapResult]);

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
          <ModelDropdownButton
            displayValue={displayValue}
            currentModelSpec={currentModelSpec}
            currentEndpointItem={currentEndpointItem}
            endpoint={endpoint ?? undefined}
            selectedAgentId={selectedAgentId}
            agentsMap={agentsMap}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            isMobile={isMobile}
            endpointsConfig={endpointsConfig}
          />
        }
      >
        {!isMobile ? (
          <DesktopDropdownContent
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            modelSpecs={modelSpecs}
            filteredMenuItems={filteredMenuItems}
            selectedSpec={selectedSpec || undefined}
            endpointsConfig={endpointsConfig}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            onSelectSpec={onSelectSpec}
            onSelectEndpoint={onSelectEndpoint}
            endpointRequiresUserKey={endpointRequiresUserKey}
            handleOpenKeyDialog={handleOpenKeyDialog}
            handleModelSelect={handleModelSelect}
            conversation={conversation}
            selectedAgentId={selectedAgentId}
            selectedAssistantId={selectedAssistantId}
            agentsMap={agentsMap}
            assistantsMap={assistantsMap}
            modelsQuery={modelsQuery}
          />
        ) : (
          <MobileDropdownContent
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            currentView={currentView}
            modelSpecs={modelSpecs}
            filteredMenuItems={filteredMenuItems}
            selectedSpec={selectedSpec || undefined}
            endpointsConfig={endpointsConfig}
            onSelectSpec={onSelectSpec}
            onSelectEndpoint={onSelectEndpoint}
            endpointRequiresUserKey={endpointRequiresUserKey}
            handleOpenKeyDialog={handleOpenKeyDialog}
            handleGoBack={handleGoBack}
            handleModelChoice={handleModelChoice}
            conversation={conversation}
            selectedProvider={selectedProvider}
            selectedProviderData={selectedProviderData}
            modelsForProvider={modelsForProvider}
            selectedAgentId={selectedAgentId}
            selectedAssistantId={selectedAssistantId}
            agentsMap={agentsMap}
            assistantsMap={assistantsMap}
            modelSelectEnabled={modelSelectEnabled !== false}
            hasModelsOnCurrent={hasModelsOnCurrent}
            modelsQuery={modelsQuery}
          />
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
