import React, { startTransition, createContext, useContext, useState, useMemo } from 'react';
import { EModelEndpoint, isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { Endpoint, SelectedValues } from '~/common';
import { useAgentsMapContext, useAssistantsMapContext, useChatContext } from '~/Providers';
import { useEndpoints, useSelectorEffects, useKeyDialog } from '~/hooks';
import useSelectMention from '~/hooks/Input/useSelectMention';
import { useGetEndpointsQuery } from '~/data-provider';
import { filterItems } from './utils';

type ModelSelectorContextType = {
  // State
  searchValue: string;
  selectedValues: SelectedValues;
  endpointSearchValues: Record<string, string>;
  searchResults: (t.TModelSpec | Endpoint)[] | null;
  // LibreChat
  modelSpecs: t.TModelSpec[];
  mappedEndpoints: Endpoint[];
  agentsMap: t.TAgentsMap | undefined;
  assistantsMap: t.TAssistantsMap | undefined;
  endpointsConfig: t.TEndpointsConfig;

  // Functions
  endpointRequiresUserKey: (endpoint: string) => boolean;
  setSelectedValues: React.Dispatch<React.SetStateAction<SelectedValues>>;
  setSearchValue: (value: string) => void;
  setEndpointSearchValue: (endpoint: string, value: string) => void;
  handleSelectSpec: (spec: t.TModelSpec) => void;
  handleSelectEndpoint: (endpoint: Endpoint) => void;
  handleSelectModel: (endpoint: Endpoint, model: string) => void;
} & ReturnType<typeof useKeyDialog>;

const ModelSelectorContext = createContext<ModelSelectorContextType | undefined>(undefined);

export function useModelSelectorContext() {
  const context = useContext(ModelSelectorContext);
  if (context === undefined) {
    throw new Error('useModelSelectorContext must be used within a ModelSelectorProvider');
  }
  return context;
}

interface ModelSelectorProviderProps {
  children: React.ReactNode;
  modelSpecs: t.TModelSpec[];
  interfaceConfig: t.TInterfaceConfig;
}

export function ModelSelectorProvider({
  children,
  modelSpecs,
  interfaceConfig,
}: ModelSelectorProviderProps) {
  const agentsMap = useAgentsMapContext();
  const assistantsMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { conversation, newConversation } = useChatContext();
  const { mappedEndpoints, endpointRequiresUserKey } = useEndpoints({
    agentsMap,
    assistantsMap,
    endpointsConfig,
    interfaceConfig,
  });
  const { onSelectEndpoint, onSelectSpec } = useSelectMention({
    // presets,
    modelSpecs,
    assistantsMap,
    endpointsConfig,
    newConversation,
    returnHandlers: true,
  });

  // State
  const [selectedValues, setSelectedValues] = useState<SelectedValues>({
    endpoint: conversation?.endpoint || '',
    model: conversation?.model || '',
    modelSpec: conversation?.spec || '',
  });
  useSelectorEffects({
    agentsMap,
    conversation,
    assistantsMap,
    setSelectedValues,
  });

  const [searchValue, setSearchValueState] = useState('');
  const [endpointSearchValues, setEndpointSearchValues] = useState<Record<string, string>>({});

  const keyProps = useKeyDialog();

  // Memoized search results
  const searchResults = useMemo(() => {
    if (!searchValue) {
      return null;
    }
    const allItems = [...modelSpecs, ...mappedEndpoints];
    return filterItems(allItems, searchValue, agentsMap, assistantsMap || {});
  }, [searchValue, modelSpecs, mappedEndpoints, agentsMap, assistantsMap]);

  // Functions
  const setSearchValue = (value: string) => {
    startTransition(() => setSearchValueState(value));
  };

  const setEndpointSearchValue = (endpoint: string, value: string) => {
    setEndpointSearchValues((prev) => ({
      ...prev,
      [endpoint]: value,
    }));
  };

  const handleSelectSpec = (spec: t.TModelSpec) => {
    let model = spec.preset.model ?? null;
    onSelectSpec?.(spec);
    if (isAgentsEndpoint(spec.preset.endpoint)) {
      model = spec.preset.agent_id ?? '';
    } else if (isAssistantsEndpoint(spec.preset.endpoint)) {
      model = spec.preset.assistant_id ?? '';
    }
    setSelectedValues({
      endpoint: spec.preset.endpoint,
      model,
      modelSpec: spec.name,
    });
  };

  const handleSelectEndpoint = (endpoint: Endpoint) => {
    if (!endpoint.hasModels) {
      if (endpoint.value) {
        onSelectEndpoint?.(endpoint.value);
      }
      setSelectedValues({
        endpoint: endpoint.value,
        model: '',
        modelSpec: '',
      });
    }
  };

  const handleSelectModel = (endpoint: Endpoint, model: string) => {
    if (isAgentsEndpoint(endpoint.value)) {
      onSelectEndpoint?.(endpoint.value, {
        agent_id: model,
      });
    } else if (isAssistantsEndpoint(endpoint.value)) {
      onSelectEndpoint?.(endpoint.value, {
        assistant_id: model,
        model: assistantsMap?.[endpoint.value]?.[model]?.model ?? '',
      });
    } else if (endpoint.value) {
      onSelectEndpoint?.(endpoint.value, { model });
    }
    setSelectedValues({
      endpoint: endpoint.value,
      model: model,
      modelSpec: '',
    });
  };

  const value = {
    // State
    searchValue,
    searchResults,
    selectedValues,
    endpointSearchValues,
    // LibreChat
    agentsMap,
    modelSpecs,
    assistantsMap,
    mappedEndpoints,
    endpointsConfig,

    // Functions
    setSearchValue,
    handleSelectSpec,
    handleSelectModel,
    setSelectedValues,
    handleSelectEndpoint,
    setEndpointSearchValue,
    endpointRequiresUserKey,
    // Dialog
    ...keyProps,
  };

  return <ModelSelectorContext.Provider value={value}>{children}</ModelSelectorContext.Provider>;
}
