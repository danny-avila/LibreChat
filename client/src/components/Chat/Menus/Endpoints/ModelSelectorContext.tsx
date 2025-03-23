import React, { createContext, useContext, useState, useMemo, startTransition } from 'react';
import {
  EModelEndpoint,
  TModelSpec,
  TAgentsMap,
  TAssistantsMap,
  TInterfaceConfig,
} from 'librechat-data-provider';
import { useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { Endpoint, SelectedValues } from './types';
import { useModelSelection, useEndpoints } from '~/hooks';
import { filterItems } from './utils';

interface ModelSelectorContextType {
  // State
  searchValue: string;
  selectedValues: SelectedValues;
  endpointSearchValues: Record<string, string>;
  searchResults: (TModelSpec | Endpoint)[] | null;
  // LibreChat
  modelSpecs: TModelSpec[];
  agentsMap: TAgentsMap | undefined;
  assistantsMap: TAssistantsMap | undefined;

  // Functions
  getDisplayValue: () => string;
  setSelectedValues: React.Dispatch<React.SetStateAction<SelectedValues>>;
  setSearchValue: (value: string) => void;
  setEndpointSearchValue: (endpoint: string, value: string) => void;
  handleSelectSpec: (spec: TModelSpec) => void;
  handleSelectEndpoint: (endpoint: Endpoint) => void;
  handleSelectModel: (endpoint: Endpoint, model: string) => void;
}

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
  modelSpecs: TModelSpec[];
  interfaceConfig: TInterfaceConfig;
}

export function ModelSelectorProvider({
  children,
  modelSpecs,
  interfaceConfig,
}: ModelSelectorProviderProps) {
  const agentsMap = useAgentsMapContext();
  const { mappedEndpoints } = useEndpoints();
  const assistantsMap = useAssistantsMapContext();
  const { handleModelSelect } = useModelSelection();

  // State
  const [selectedValues, setSelectedValues] = useState<SelectedValues>({
    endpoint: '',
    model: '',
    modelSpec: '',
  });
  const [searchValue, setSearchValueState] = useState('');
  const [endpointSearchValues, setEndpointSearchValues] = useState<Record<string, string>>({});

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

  const handleSelectSpec = (spec: TModelSpec) => {
    setSelectedValues({
      endpoint: spec.preset.endpoint,
      model: spec.preset.model ?? null,
      modelSpec: spec.name,
    });
  };

  const handleSelectEndpoint = (endpoint: Endpoint) => {
    if (!endpoint.hasModels) {
      setSelectedValues({
        endpoint: endpoint.value,
        model: '',
        modelSpec: '',
      });
    }
  };

  const handleSelectModel = (endpoint: Endpoint, model: string) => {
    if (endpoint) {
      handleModelSelect(endpoint.value as EModelEndpoint, model);
    }
    setSelectedValues({
      endpoint: endpoint.value,
      model: model,
      modelSpec: '',
    });
  };

  const getDisplayValue = () => {
    if (selectedValues.modelSpec) {
      const spec = modelSpecs.find((s) => s.name === selectedValues.modelSpec);
      return spec?.label || 'Select a model';
    }

    if (selectedValues.model && selectedValues.endpoint) {
      const endpoint = mappedEndpoints.find((e) => e.value === selectedValues.endpoint);
      if (!endpoint) {
        return 'Select a model';
      }

      if (
        endpoint.value === EModelEndpoint.agents &&
        endpoint.agentNames &&
        endpoint.agentNames[selectedValues.model]
      ) {
        return endpoint.agentNames[selectedValues.model];
      }

      if (
        endpoint.value === EModelEndpoint.assistants &&
        endpoint.assistantNames &&
        endpoint.assistantNames[selectedValues.model]
      ) {
        return endpoint.assistantNames[selectedValues.model];
      }

      return selectedValues.model;
    }

    if (selectedValues.endpoint) {
      const endpoint = mappedEndpoints.find((e) => e.value === selectedValues.endpoint);
      return endpoint?.label || 'Select a model';
    }

    return 'Select a model';
  };

  const value = {
    // State
    selectedValues,
    searchValue,
    endpointSearchValues,
    searchResults,
    // LibreChat
    modelSpecs,
    agentsMap,
    assistantsMap,

    // Functions
    setSelectedValues,
    setSearchValue,
    setEndpointSearchValue,
    handleSelectSpec,
    handleSelectEndpoint,
    handleSelectModel,
    getDisplayValue,
  };

  return <ModelSelectorContext.Provider value={value}>{children}</ModelSelectorContext.Provider>;
}
