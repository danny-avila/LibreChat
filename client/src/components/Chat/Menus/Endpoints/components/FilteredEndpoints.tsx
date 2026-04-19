import { useMemo } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { EndpointItem } from './EndpointItem';
import { useMockPermissions } from '~/hooks/Endpoint/mockApi';
/**
 * Component that filters endpoints and models based on permissions
 * This filtering is purely visual - doesn't block functionality
 */
export function FilteredEndpoints({ endpoints }: { endpoints: Endpoint[] }) {
  const {
    selectedValues: { model: selectedModel },
  } = useModelSelectorContext();

  // ===================================================
  // CUSTOM - Get permissions from API or use demo data
  // To switch to demo data: replace useMockPermissions() with DEMO_PERMISSIONS
  // ===================================================
  const {
    providers: apiProviders,
    modelsByProvider,
    isLoading: permissionsLoading,
  } = useMockPermissions();
  // const { providers: apiProviders, modelsByProvider, isLoading: permissionsLoading } = _DEMO_PERMISSIONS; // Uncomment for demo data
  // ===================================================

  // Filter endpoints based on permissions
  const filteredEndpoints = useMemo(() => {
    // Don't show anything while loading to prevent flash
    if (permissionsLoading) {
      return [];
    }

    // If no restrictions, show all endpoints
    if (!apiProviders || apiProviders.length === 0) {
      return endpoints;
    }

    const providersSet = new Set(apiProviders);
    return endpoints.filter((endpoint) => {
      // Always show agents endpoint
      if (endpoint.value === EModelEndpoint.agents) {
        return true;
      }
      // Only show endpoints that match API providers
      // Note: We don't show selected endpoint if it's not in allowed providers
      return providersSet.has(endpoint.value as EModelEndpoint);
    });
  }, [endpoints, apiProviders, permissionsLoading]);

  // Filter models for each endpoint based on permissions
  const endpointsWithFilteredModels = useMemo(() => {
    // Don't show anything while loading to prevent flash
    if (permissionsLoading) {
      return [];
    }

    if (!modelsByProvider) {
      return filteredEndpoints;
    }

    return filteredEndpoints
      .map((endpoint) => {
        // Skip filtering for agents/assistants
        if (
          endpoint.value === EModelEndpoint.agents ||
          endpoint.value === EModelEndpoint.assistants ||
          endpoint.value === EModelEndpoint.azureAssistants
        ) {
          return endpoint;
        }

        // Get allowed models for this provider
        const allowedModels = modelsByProvider[endpoint.value];
        // If endpoint is not in modelsByProvider, it means it's not allowed - hide it
        if (!allowedModels) {
          return null; // Endpoint not in permissions, don't show it
        }
        // If allowedModels is empty array, show no models (not all models)
        if (allowedModels.length === 0) {
          return {
            ...endpoint,
            models: [], // Show no models if empty array
          };
        }

        // Filter models to only include allowed ones + selected model (non-blocking)
        const allowedModelsSet = new Set(allowedModels);
        const filteredModelsList =
          endpoint.models?.filter(
            (model) => allowedModelsSet.has(model.name) || model.name === selectedModel,
          ) || [];

        return {
          ...endpoint,
          models: filteredModelsList.length > 0 ? filteredModelsList : endpoint.models, // Fallback to all if empty
        };
      })
      .filter((endpoint): endpoint is Endpoint => endpoint !== null); // Remove null entries
  }, [filteredEndpoints, modelsByProvider, permissionsLoading, selectedModel]);

  return (
    <>
      {endpointsWithFilteredModels.map((endpoint, index) => (
        <EndpointItem
          endpoint={endpoint}
          endpointIndex={index}
          key={`endpoint-${endpoint.value}-${index}`}
        />
      ))}
    </>
  );
}
