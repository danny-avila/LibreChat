import React, { Fragment } from 'react';
import { EarthIcon } from 'lucide-react';
import { isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { CustomMenuItem as MenuItem } from '../CustomMenu';
import { ModelSpecItem } from './ModelSpecItem';
import { cn } from '~/utils';
import { useEndpointKeyStatus } from '~/hooks/Endpoint';

interface SearchResultsProps {
  results: (TModelSpec | Endpoint)[] | null;
  localize: (phraseKey: any, options?: any) => string;
  searchValue: string;
}

export function SearchResults({ results, localize, searchValue }: SearchResultsProps) {
  const {
    selectedValues: { modelSpec: selectedSpec },
  } = useModelSelectorContext();

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
      {results.map((item, index) => {
        if ('name' in item && 'label' in item) {
          const spec = item as TModelSpec;
          return (
            <ModelSpecItem key={spec.name} spec={spec} isSelected={selectedSpec === spec.name} />
          );
        }

        const endpoint = item as Endpoint;
        return (
          <EndpointSearchResult
            key={`endpoint-${endpoint.value}-search-${index}`}
            endpoint={endpoint}
            searchValue={searchValue}
          />
        );
      })}
    </>
  );
}

function EndpointSearchResult({
  endpoint,
  searchValue,
}: {
  endpoint: Endpoint;
  searchValue: string;
}) {
  const {
    selectedValues,
    handleSelectModel,
    handleSelectEndpoint,
    endpointsConfig,
  } = useModelSelectorContext();
  const { model: selectedModel, endpoint: selectedEndpoint } = selectedValues;

  const { requiresKey, keyProvided } = useEndpointKeyStatus(endpoint.value, endpointsConfig);
  const isLocked = requiresKey && !keyProvided;

  if (!endpoint.hasModels || !endpoint.models || endpoint.models.length === 0) {
    return (
      <MenuItem
        disabled={isLocked}
        onClick={(event) => {
          if (isLocked) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          handleSelectEndpoint(endpoint);
        }}
        className={cn(
          'flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm',
          isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        )}
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

  const lowerQuery = searchValue.trim().toLowerCase();
  const matchesEndpointLabel = lowerQuery
    ? endpoint.label.toLowerCase().includes(lowerQuery)
    : false;

  const filteredModels = !lowerQuery || matchesEndpointLabel
    ? endpoint.models
    : endpoint.models.filter((model) => {
        let modelName = model.name;
        if (isAgentsEndpoint(endpoint.value) && endpoint.agentNames?.[model.name]) {
          modelName = endpoint.agentNames[model.name];
        } else if (
          isAssistantsEndpoint(endpoint.value) &&
          endpoint.assistantNames?.[model.name]
        ) {
          modelName = endpoint.assistantNames[model.name];
        }
        return modelName.toLowerCase().includes(lowerQuery);
      });

  if (!filteredModels.length) {
    return null;
  }

  return (
    <Fragment>
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1 text-sm font-medium',
          isLocked ? 'opacity-60' : '',
        )}
      >
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
        if (isAgentsEndpoint(endpoint.value) && endpoint.agentNames?.[modelId]) {
          modelName = endpoint.agentNames[modelId];
          const modelInfo = endpoint.models?.find((m) => m.name === modelId);
          isGlobal = modelInfo?.isGlobal ?? false;
        } else if (
          isAssistantsEndpoint(endpoint.value) &&
          endpoint.assistantNames?.[modelId]
        ) {
          modelName = endpoint.assistantNames[modelId];
        }

        return (
          <MenuItem
            key={`${endpoint.value}-${modelId}`}
            disabled={isLocked}
            onClick={(event) => {
              if (isLocked) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              handleSelectModel(endpoint, modelId);
            }}
            className={cn(
              'flex w-full items-center justify-start rounded-lg px-3 py-2 pl-6 text-sm',
              isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            )}
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
            {isGlobal && <EarthIcon className="ml-auto size-4 text-green-400" />}
            {selectedEndpoint === endpoint.value && selectedModel === modelId && (
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
      })}
    </Fragment>
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
