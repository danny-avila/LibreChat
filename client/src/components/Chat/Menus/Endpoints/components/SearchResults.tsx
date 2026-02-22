import React, { Fragment } from 'react';
import { VisuallyHidden } from '@ariakit/react';
import { CheckCircle2, EarthIcon } from 'lucide-react';
import { isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { CustomMenuItem as MenuItem } from '../CustomMenu';
import SpecIcon from './SpecIcon';
import { cn } from '~/utils';

interface SearchResultsProps {
  results: (TModelSpec | Endpoint)[] | null;
  localize: (phraseKey: any, options?: any) => string;
  searchValue: string;
}

export function SearchResults({ results, localize, searchValue }: SearchResultsProps) {
  const {
    selectedValues,
    handleSelectSpec,
    handleSelectModel,
    handleSelectEndpoint,
    endpointsConfig,
  } = useModelSelectorContext();

  const {
    modelSpec: selectedSpec,
    endpoint: selectedEndpoint,
    model: selectedModel,
  } = selectedValues;

  if (!results) {
    return null;
  }
  if (!results.length) {
    return (
      <>
        <div role="alert" aria-live="polite" className="sr-only">
          {localize('com_files_no_results')}
        </div>
        <div className="cursor-default p-2 sm:py-1 sm:text-sm">
          {localize('com_files_no_results')}
        </div>
      </>
    );
  }

  return (
    <>
      <div role="alert" aria-live="polite" className="sr-only">
        {results.length === 1
          ? localize('com_files_result_found', { count: results.length })
          : localize('com_files_results_found', { count: results.length })}
      </div>
      {results.map((item, i) => {
        if ('name' in item && 'label' in item) {
          // Render model spec
          const spec = item as TModelSpec;
          return (
            <MenuItem
              key={spec.name}
              onClick={() => handleSelectSpec(spec)}
              aria-selected={selectedSpec === spec.name || undefined}
              className={cn(
                'flex w-full cursor-pointer justify-between rounded-lg px-2 text-sm',
                spec.description ? 'items-start' : 'items-center',
              )}
            >
              <div
                className={cn(
                  'flex w-full min-w-0 gap-2 px-1 py-1',
                  spec.description ? 'items-start' : 'items-center',
                )}
              >
                {(spec.showIconInMenu ?? true) && (
                  <div className="flex-shrink-0">
                    <SpecIcon currentSpec={spec} endpointsConfig={endpointsConfig} />
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-left">{spec.label}</span>
                  {spec.description && (
                    <span className="break-words text-xs font-normal">{spec.description}</span>
                  )}
                </div>
              </div>
              {selectedSpec === spec.name && (
                <>
                  <CheckCircle2
                    className={cn(
                      'size-4 shrink-0 text-text-primary',
                      spec.description ? 'mt-1' : '',
                    )}
                    aria-hidden="true"
                  />
                  <VisuallyHidden>{localize('com_a11y_selected')}</VisuallyHidden>
                </>
              )}
            </MenuItem>
          );
        } else {
          // For an endpoint item
          const endpoint = item as Endpoint;
          if (endpoint.hasModels && endpoint.models && endpoint.models.length > 0) {
            const lowerQuery = searchValue.toLowerCase();
            const filteredModels = endpoint.label.toLowerCase().includes(lowerQuery)
              ? endpoint.models
              : endpoint.models.filter((model) => {
                  let modelName = model.name;
                  if (
                    isAgentsEndpoint(endpoint.value) &&
                    endpoint.agentNames &&
                    endpoint.agentNames[model.name]
                  ) {
                    modelName = endpoint.agentNames[model.name];
                  } else if (
                    isAssistantsEndpoint(endpoint.value) &&
                    endpoint.assistantNames &&
                    endpoint.assistantNames[model.name]
                  ) {
                    modelName = endpoint.assistantNames[model.name];
                  }
                  return modelName.toLowerCase().includes(lowerQuery);
                });

            if (!filteredModels.length) {
              return null; // skip if no models match
            }

            return (
              <Fragment key={`endpoint-${endpoint.value}-search-${i}`}>
                <div className="flex items-center gap-2 px-3 py-1 text-sm font-medium">
                  {endpoint.icon && (
                    <div className="flex items-center justify-center overflow-hidden rounded-full p-1">
                      {endpoint.icon}
                    </div>
                  )}
                  {endpoint.label}
                </div>
                {filteredModels.map((model) => {
                  const modelId = model.name;

                  let isGlobal = false;
                  let modelName = modelId;
                  if (
                    isAgentsEndpoint(endpoint.value) &&
                    endpoint.agentNames &&
                    endpoint.agentNames[modelId]
                  ) {
                    modelName = endpoint.agentNames[modelId];
                    const modelInfo = endpoint?.models?.find((m) => m.name === modelId);
                    isGlobal = modelInfo?.isGlobal ?? false;
                  } else if (
                    isAssistantsEndpoint(endpoint.value) &&
                    endpoint.assistantNames &&
                    endpoint.assistantNames[modelId]
                  ) {
                    modelName = endpoint.assistantNames[modelId];
                  }

                  const isModelSelected =
                    selectedEndpoint === endpoint.value && selectedModel === modelId;
                  return (
                    <MenuItem
                      key={`${endpoint.value}-${modelId}-search-${i}`}
                      onClick={() => handleSelectModel(endpoint, modelId)}
                      aria-selected={isModelSelected || undefined}
                      className="flex w-full cursor-pointer items-center justify-start rounded-lg px-3 py-2 pl-6 text-sm"
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
                      {isGlobal && (
                        <EarthIcon className="ml-auto size-4 text-green-400" aria-hidden="true" />
                      )}
                      {isModelSelected && (
                        <>
                          <CheckCircle2
                            className="size-4 shrink-0 text-text-primary"
                            aria-hidden="true"
                          />
                          <VisuallyHidden>{localize('com_a11y_selected')}</VisuallyHidden>
                        </>
                      )}
                    </MenuItem>
                  );
                })}
              </Fragment>
            );
          } else {
            // Endpoints with no models
            const isEndpointSelected = selectedEndpoint === endpoint.value;
            return (
              <MenuItem
                key={`endpoint-${endpoint.value}-search-item`}
                onClick={() => handleSelectEndpoint(endpoint)}
                aria-selected={isEndpointSelected || undefined}
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
                {isEndpointSelected && (
                  <>
                    <CheckCircle2
                      className="size-4 shrink-0 text-text-primary"
                      aria-hidden="true"
                    />
                    <VisuallyHidden>{localize('com_a11y_selected')}</VisuallyHidden>
                  </>
                )}
              </MenuItem>
            );
          }
        }
      })}
    </>
  );
}

export function renderSearchResults(
  results: (TModelSpec | Endpoint)[] | null,
  localize: (phraseKey: any, options?: any) => string,
  searchValue: string,
) {
  return (
    <SearchResults
      key={`search-results-${searchValue}`}
      results={results}
      localize={localize}
      searchValue={searchValue}
    />
  );
}
