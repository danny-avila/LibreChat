import React, { Fragment, startTransition, useMemo, useState } from 'react';
import { Bot, SettingsIcon } from 'lucide-react';
import type {
  EModelEndpoint,
  TModelSpec,
  TInterfaceConfig,
  TAgentsMap,
  TAssistantsMap,
  Agent,
  TConversation,
} from 'librechat-data-provider';
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
import { CustomMenu as Menu, CustomMenuItem as MenuItem } from './CustomMenu';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { cn, getModelSpecIconURL, filterMenuItems, getConvoSwitchLogic } from '~/utils';
import { useGetEndpointsQuery } from '~/data-provider';
import type { ExtendedEndpoint } from '~/common';
import DialogManager from './DialogManager';
import { Spinner } from '~/components';
import store from '~/store';

interface ModelSpec {
  name: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface Endpoint {
  value: string;
  label: string;
  hasModels: boolean;
  models?: string[];
  icon: React.ReactNode;
  agentNames?: Record<string, string>;
  assistantNames?: Record<string, string>;
  modelIcons?: Record<string, string | undefined>;
}

function filterItems<T extends { label: string; name?: string; value?: string; models?: string[] }>(
  items: T[],
  searchValue: string,
  agentsMap: TAgentsMap | undefined,
  assistantsMap: TAssistantsMap | undefined,
): T[] | null {
  const searchTermLower = searchValue.trim().toLowerCase();
  if (!searchTermLower) {
    return null;
  }

  return items.filter((item) => {
    const itemMatches =
      item.label.toLowerCase().includes(searchTermLower) ||
      (item.name && item.name.toLowerCase().includes(searchTermLower)) ||
      (item.value && item.value.toLowerCase().includes(searchTermLower));

    if (itemMatches) {
      return true;
    }

    if (item.models && item.models.length > 0) {
      return item.models.some((modelId) => {
        if (modelId.toLowerCase().includes(searchTermLower)) {
          return true;
        }

        if (item.value === 'agents' && agentsMap && modelId in agentsMap) {
          const agentName = agentsMap[modelId]?.name;
          return typeof agentName === 'string' && agentName.toLowerCase().includes(searchTermLower);
        }

        if (item.value === 'assistants' && assistantsMap && modelId in assistantsMap) {
          const assistant = assistantsMap[modelId];
          if (assistant && typeof assistant.name === 'string') {
            return assistant.name.toLowerCase().includes(searchTermLower);
          }
          return false;
        }

        return false;
      });
    }

    return false;
  });
}

function renderModelSpecs(
  specs: ModelSpec[],
  selectedSpec: string,
  onSelect: (spec: ModelSpec) => void,
) {
  if (!specs || specs.length === 0) {
    return null;
  }

  return specs.map((spec) => (
    <MenuItem
      key={spec.name}
      onClick={() => onSelect(spec)}
      className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 text-sm"
    >
      <div className="flex items-center gap-2">
        {spec.icon && (
          <div className="my-1 flex-shrink-0">
            <div className="flex items-center justify-center overflow-hidden rounded-full">
              {spec.icon}
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1">
            <span className="truncate text-left">{spec.label}</span>
            {spec.description && (
              <span className="break-words text-xs font-normal opacity-70">{spec.description}</span>
            )}
          </div>
        </div>
      </div>
      {selectedSpec === spec.name && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="block"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
            fill="currentColor"
          />
        </svg>
      )}
    </MenuItem>
  ));
}

function renderEndpointModels(
  endpoint: Endpoint,
  models: string[],
  selectedModel: string,
  onSelect: (model: string) => void,
  filteredModels?: string[],
) {
  const modelsToRender = filteredModels || models;

  return modelsToRender.map((modelId) => {
    let modelName = modelId;
    const avatarUrl = endpoint.modelIcons?.[modelId] || null;

    // Use custom names if available
    if (endpoint.value === 'agents' && endpoint.agentNames?.[modelId]) {
      modelName = endpoint.agentNames[modelId];
    } else if (endpoint.value === 'assistants' && endpoint.assistantNames?.[modelId]) {
      modelName = endpoint.assistantNames[modelId];
    }

    return (
      <MenuItem
        key={modelId}
        onClick={() => onSelect(modelId)}
        className="flex h-8 w-full cursor-pointer items-center justify-start rounded-lg px-3 py-2 text-sm"
      >
        <div className="flex items-center gap-2">
          {avatarUrl ? (
            <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
              <img src={avatarUrl} alt={modelName} className="h-full w-full object-cover" />
            </div>
          ) : (endpoint.value === 'agents' || endpoint.value === 'assistants') && endpoint.icon ? (
            <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
              {endpoint.icon}
            </div>
          ) : null}
          <span>{modelName}</span>
        </div>
        {selectedModel === modelId && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="ml-auto block"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
              fill="currentColor"
            />
          </svg>
        )}
      </MenuItem>
    );
  });
}

function filterModels(
  endpoint: Endpoint,
  models: string[],
  searchValue: string,
  agentsMap: TAgentsMap | undefined,
  assistantsMap: TAssistantsMap | undefined,
): string[] {
  const searchTermLower = searchValue.trim().toLowerCase();
  if (!searchTermLower) {
    return models;
  }

  return models.filter((modelId) => {
    let modelName = modelId;

    if (endpoint.value === 'agents' && agentsMap && agentsMap[modelId]) {
      modelName = agentsMap[modelId].name || modelId;
    } else if (endpoint.value === 'assistants' && assistantsMap && assistantsMap[modelId]) {
      modelName =
        typeof assistantsMap[modelId].name === 'string'
          ? (assistantsMap[modelId].name as string)
          : modelId;
    }

    return modelName.toLowerCase().includes(searchTermLower);
  });
}

function renderEndpoints(
  mappedEndpoints: Endpoint[],
  selectedEndpoint: string,
  selectedModel: string,
  onSelectEndpoint: (endpoint: Endpoint) => void,
  onSelectModel: (endpoint: Endpoint, model: string) => void,
  endpointSearchValues: Record<string, string>,
  setEndpointSearchValue: (endpoint: string, value: string) => void,
  agentsMap: TAgentsMap | undefined,
  assistantsMap: TAssistantsMap | undefined,
  endpointRequiresUserKey: (endpoint: string) => boolean,
  handleOpenKeyDialog: (endpoint: string) => void,
) {
  return mappedEndpoints.map((endpoint) => {
    if (endpoint.hasModels) {
      const searchValue = endpointSearchValues[endpoint.value] || '';
      const filteredModels = searchValue
        ? filterModels(endpoint, endpoint.models || [], searchValue, agentsMap, assistantsMap)
        : null;

      return (
        <Menu
          key={endpoint.value}
          className="transition-opacity duration-200 ease-in-out"
          defaultOpen={endpoint.value === selectedEndpoint}
          searchValue={searchValue}
          onSearch={(value) => setEndpointSearchValue(endpoint.value, value)}
          combobox={<input placeholder={`Search ${endpoint.label} models...`} />}
          label={
            <div
              onClick={() => onSelectEndpoint(endpoint)}
              className="flex w-full cursor-pointer items-center justify-between rounded-xl px-1 py-1 text-sm"
            >
              <div className="flex items-center gap-2">
                {endpoint.icon && (
                  <div className="flex items-center justify-center overflow-hidden rounded-full">
                    {endpoint.icon}
                  </div>
                )}
                <span className="truncate text-left">{endpoint.label}</span>
              </div>
              {endpointRequiresUserKey(endpoint.value) && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenKeyDialog(endpoint.value);
                  }}
                  className="flex items-center text-text-primary"
                >
                  <SettingsIcon className="h-4 w-4" />
                </div>
              )}
            </div>
          }
        >
          {endpoint.value === 'assistants' && endpoint.models === undefined ? (
            <div className="flex items-center justify-center p-2">
              <Spinner />
            </div>
          ) : filteredModels ? (
            renderEndpointModels(
              endpoint,
              endpoint.models || [],
              selectedModel,
              (model) => onSelectModel(endpoint, model),
              filteredModels,
            )
          ) : (
            endpoint.models &&
            renderEndpointModels(endpoint, endpoint.models, selectedModel, (model) =>
              onSelectModel(endpoint, model),
            )
          )}
        </Menu>
      );
    } else {
      return (
        <MenuItem
          key={endpoint.value}
          onClick={() => onSelectEndpoint(endpoint)}
          className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm"
        >
          <div className="flex items-center gap-2">
            {endpoint.icon && (
              <div className="flex items-center justify-center overflow-hidden rounded-full p-1">
                {endpoint.icon}
              </div>
            )}
            <span>{endpoint.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {endpointRequiresUserKey(endpoint.value) && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenKeyDialog(endpoint.value);
                }}
                className="text-text-primary"
              >
                <SettingsIcon className="h-4 w-4" />
              </div>
            )}
            {selectedEndpoint === endpoint.value && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="block"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </div>
        </MenuItem>
      );
    }
  });
}

function renderSearchResults(
  results: (ModelSpec | Endpoint)[] | null,
  localize: (phraseKey: any, options?: any) => string,
  searchValue: string,
  selectedSpec: string,
  selectedEndpoint: string,
  selectedModel: string,
  onSelectSpec: (spec: ModelSpec) => void,
  onSelectEndpoint: (endpoint: Endpoint) => void,
  onSelectModel: (endpoint: Endpoint, model: string) => void,
  agentsMap: TAgentsMap | undefined,
  assistantsMap: TAssistantsMap | undefined,
) {
  if (!results) {
    return null;
  }
  if (!results.length) {
    return (
      <div className="cursor-default p-2 sm:py-1 sm:text-sm">
        {localize('com_files_no_results')}
      </div>
    );
  }

  return (
    <>
      {results.map((item) => {
        if ('name' in item && 'label' in item) {
          // Render model spec as before.
          const spec = item as ModelSpec;
          return (
            <MenuItem
              key={`spec-${spec.name}`}
              onClick={() => onSelectSpec(spec)}
              className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm"
            >
              {/* ...existing model spec rendering... */}
            </MenuItem>
          );
        } else {
          // For an endpoint item: if the endpoint label matches the query,
          // return all its models; otherwise filter its models.
          const endpoint = item as Endpoint;
          if (endpoint.hasModels && endpoint.models && endpoint.models.length > 0) {
            const lowerQuery = searchValue.toLowerCase();
            const filteredModels = endpoint.label.toLowerCase().includes(lowerQuery)
              ? endpoint.models
              : filterModels(endpoint, endpoint.models, searchValue, agentsMap, assistantsMap);
            if (!filteredModels.length) {
              return null; // skip if no models match
            }
            return (
              <Fragment key={`endpoint-${endpoint.value}`}>
                <div className="flex items-center gap-2 px-3 py-1 text-sm font-medium">
                  {endpoint.icon && (
                    <div className="flex items-center justify-center overflow-hidden rounded-full p-1">
                      {endpoint.icon}
                    </div>
                  )}
                  {endpoint.label}
                </div>
                {filteredModels.map((modelId) => {
                  let modelName = modelId;
                  if (
                    endpoint.value === 'agents' &&
                    endpoint.agentNames &&
                    endpoint.agentNames[modelId]
                  ) {
                    modelName = endpoint.agentNames[modelId];
                  } else if (
                    endpoint.value === 'assistants' &&
                    endpoint.assistantNames &&
                    endpoint.assistantNames[modelId]
                  ) {
                    modelName = endpoint.assistantNames[modelId];
                  }

                  return (
                    <MenuItem
                      key={`${endpoint.value}-${modelId}`}
                      onClick={() => onSelectModel(endpoint, modelId)}
                      className="flex w-full cursor-pointer items-center justify-start rounded-xl px-3 py-2 pl-6 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {endpoint.modelIcons?.[modelId] && (
                          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                            <img
                              src={endpoint.modelIcons[modelId]}
                              alt={modelName}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}
                        <span>{modelName}</span>
                      </div>
                      {selectedEndpoint === endpoint.value && selectedModel === modelId && (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="ml-auto block"
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
                            fill="currentColor"
                          />
                        </svg>
                      )}
                    </MenuItem>
                  );
                })}
              </Fragment>
            );
          } else {
            // Endpoints with no models render as before.
            return (
              <MenuItem
                key={`endpoint-${endpoint.value}`}
                onClick={() => onSelectEndpoint(endpoint)}
                className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  {endpoint.icon && (
                    <div
                      className="flex items-center justify-center overflow-hidden rounded-full border border-gray-200 p-1 dark:border-gray-700"
                      style={{ borderRadius: '50%' }}
                    >
                      {endpoint.icon}
                    </div>
                  )}
                  <span>{endpoint.label}</span>
                </div>
                {selectedEndpoint === endpoint.value && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="block"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </MenuItem>
            );
          }
        }
      })}
    </>
  );
}

function getSelectedIcon(
  mappedEndpoints: Endpoint[],
  selectedValues: { endpoint: string; model: string; modelSpec: string },
  modelSpecs: ModelSpec[],
): React.ReactNode | null {
  const { endpoint, model, modelSpec } = selectedValues;

  if (modelSpec) {
    const spec = modelSpecs.find((s) => s.name === modelSpec);
    return spec?.icon || null;
  }

  if (endpoint && model) {
    const selectedEndpoint = mappedEndpoints.find((e) => e.value === endpoint);
    if (!selectedEndpoint) {
      return null;
    }

    if (selectedEndpoint.modelIcons?.[model]) {
      const iconUrl = selectedEndpoint.modelIcons[model];
      return (
        <div className="h-5 w-5 overflow-hidden rounded-full">
          <img src={iconUrl} alt={model} className="h-full w-full object-cover" />
        </div>
      );
    }

    return (
      selectedEndpoint.icon || <Bot size={20} className="icon-md shrink-0 text-text-primary" />
    );
  }

  if (endpoint) {
    const selectedEndpoint = mappedEndpoints.find((e) => e.value === endpoint);
    return selectedEndpoint?.icon || null;
  }

  return null;
}

export default function ModelSelector({
  interfaceConfig,
  modelSpecs,
}: {
  interfaceConfig: TInterfaceConfig;
  modelSpecs: TModelSpec[];
}) {
  const localize = useLocalize();

  const agentsMap = useAgentsMapContext();
  const assistantsMap = useAssistantsMapContext();

  const [selectedValues, setSelectedValues] = useState({
    endpoint: '',
    model: '',
    modelSpec: '',
  });

  const endpointsMenuEnabled = interfaceConfig?.endpointsMenu ?? false;
  const modelSelectEnabled = interfaceConfig?.modelSelect ?? false;

  const { keyDialogOpen, keyDialogEndpoint, setKeyDialogOpen, handleOpenKeyDialog } =
    useKeyDialog();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { mappedEndpoints, endpointRequiresUserKey } = useEndpoints();
  const { handleEndpointSelect, handleModelSelect } = useModelSelection();

  const [searchValue, setSearchValue] = useState('');
  const [endpointSearchValues, setEndpointSearchValues] = useState<Record<string, string>>({});
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('');

  const setEndpointSearchValue = (endpoint: string, value: string) => {
    setEndpointSearchValues((prev) => ({
      ...prev,
      [endpoint]: value,
    }));
  };

  const searchResults = useMemo(() => {
    if (!searchValue) {
      return null;
    }
    const allItems = [...modelSpecs, ...mappedEndpoints];
    return filterItems(allItems, searchValue, agentsMap, assistantsMap || {});
  }, [searchValue]);

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
        endpoint.value === 'agents' &&
        endpoint.agentNames &&
        endpoint.agentNames[selectedValues.model]
      ) {
        return endpoint.agentNames[selectedValues.model];
      }

      if (
        endpoint.value === 'assistants' &&
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

  const handleSelectSpec = (spec: ModelSpec) => {
    setSelectedValues({
      endpoint: '',
      model: '',
      modelSpec: spec.name,
    });
  };

  const handleSelectEndpoint = (endpoint: Endpoint) => {
    setSelectedEndpoint(endpoint.value);
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

  const selectedIcon = getSelectedIcon(mappedEndpoints, selectedValues, modelSpecs);

  const trigger = (
    <button
      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      aria-label="Select model"
    >
      {selectedIcon && React.isValidElement(selectedIcon) && (
        <div className="flex items-center justify-center overflow-hidden rounded-full">
          {selectedIcon}
        </div>
      )}
      <span className="flex-grow truncate text-left">{getDisplayValue()}</span>
    </button>
  );

  const handleOpenKeyDialogWrapper = (endpoint: string) => {
    handleOpenKeyDialog(endpoint as EModelEndpoint, {} as React.MouseEvent);
  };

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2">
      <Menu
        values={selectedValues}
        onValuesChange={(values: Record<string, any>) => {
          setSelectedValues({
            endpoint: values.endpoint || '',
            model: values.model || '',
            modelSpec: values.modelSpec || '',
          });
        }}
        onSearch={(value) => startTransition(() => setSearchValue(value))}
        combobox={<input placeholder="Search models and endpoints..." />}
        trigger={trigger}
      >
        {searchResults ? (
          renderSearchResults(
            searchResults,
            localize,
            searchValue,
            selectedValues.modelSpec,
            selectedValues.endpoint,
            selectedValues.model,
            handleSelectSpec,
            handleSelectEndpoint,
            handleSelectModel,
            agentsMap,
            assistantsMap,
          )
        ) : (
          <>
            {renderEndpoints(
              mappedEndpoints,
              selectedEndpoint,
              selectedValues.model,
              handleSelectEndpoint,
              handleSelectModel,
              endpointSearchValues,
              setEndpointSearchValue,
              agentsMap || {},
              assistantsMap || {},
              endpointRequiresUserKey,
              handleOpenKeyDialogWrapper,
            )}
            {renderModelSpecs(modelSpecs, selectedValues.modelSpec, handleSelectSpec)}
          </>
        )}
      </Menu>
      <DialogManager
        keyDialogOpen={keyDialogOpen}
        keyDialogEndpoint={keyDialogEndpoint || undefined}
        setKeyDialogOpen={setKeyDialogOpen}
        endpointsConfig={endpointsConfig || {}}
      />
    </div>
  );
}
