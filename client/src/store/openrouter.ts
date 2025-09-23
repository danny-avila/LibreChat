import { atom, selector } from 'recoil';
import { atomWithLocalStorage } from './utils';

// TypeScript interfaces for OpenRouter state
export interface OpenRouterCredits {
  balance: number;
  currency: string;
  lastUpdated: number;
  optimistic?: boolean; // Flag for optimistic updates
}

export interface OpenRouterModel {
  id: string;
  name: string;
  pricing?: {
    prompt: number;
    completion: number;
  };
  contextLength?: number;
  provider?: string;
}

export interface OpenRouterState {
  model: string;
  models: string[]; // Fallback chain
  route: 'auto' | 'fallback';
  providerPreferences: string[];
  maxCreditsPerRequest?: number;
  includeReasoning?: boolean;
}

// Default values
const DEFAULT_MODEL = ''; // No default model - user must select
const DEFAULT_ROUTE: OpenRouterState['route'] = 'fallback';

// Persistent atoms with localStorage
export const openRouterModelState = atomWithLocalStorage<string>('openRouterModel', DEFAULT_MODEL);

export const openRouterFallbackChainState = atomWithLocalStorage<string[]>(
  'openRouterFallbackChain',
  [],
);

export const openRouterAutoRouterEnabledState = atomWithLocalStorage<boolean>(
  'openRouterAutoRouterEnabled',
  false, // Disabled by default - user must explicitly enable
);

export const openRouterZDREnabledState = atomWithLocalStorage<boolean>(
  'openRouterZDREnabled',
  false, // Disabled by default - user must explicitly enable for privacy
);

export const openRouterRouteState = atomWithLocalStorage<OpenRouterState['route']>(
  'openRouterRoute',
  DEFAULT_ROUTE,
);

export const openRouterProviderPreferencesState = atomWithLocalStorage<string[]>(
  'openRouterProviderPreferences',
  [],
);

export const openRouterMaxCreditsPerRequestState = atomWithLocalStorage<number | undefined>(
  'openRouterMaxCreditsPerRequest',
  undefined,
);

export const openRouterIncludeReasoningState = atomWithLocalStorage<boolean>(
  'openRouterIncludeReasoning',
  false,
);

// Static atoms (not persisted)
export const openRouterCreditsState = atom<OpenRouterCredits | null>({
  key: 'openRouterCredits',
  default: null,
});

export const openRouterModelsListState = atom<OpenRouterModel[]>({
  key: 'openRouterModelsList',
  default: [],
});

export const openRouterCreditsLoadingState = atom<boolean>({
  key: 'openRouterCreditsLoading',
  default: false,
});

export const openRouterCreditsErrorState = atom<string | null>({
  key: 'openRouterCreditsError',
  default: null,
});

// Store the actual model used by OpenRouter (when auto-router selects a model)
export const openRouterActualModelState = atom<string | null>({
  key: 'openRouterActualModel',
  default: null,
});

// Selectors
export const openRouterConfigSelector = selector<OpenRouterState>({
  key: 'openRouterConfigSelector',
  get: ({ get }) => {
    const model = get(openRouterModelState);
    const models = get(openRouterFallbackChainState);
    const route = get(openRouterRouteState);
    const providerPreferences = get(openRouterProviderPreferencesState);
    const maxCreditsPerRequest = get(openRouterMaxCreditsPerRequestState);
    const includeReasoning = get(openRouterIncludeReasoningState);
    const autoRouterEnabled = get(openRouterAutoRouterEnabledState);

    // Pass auto-router as a separate flag, don't override the model
    // This maintains state isolation - UI shows user's selection,
    // backend handles the transformation to 'openrouter/auto'
    return {
      model, // Keep the user's selected model
      autoRouter: autoRouterEnabled, // Pass as separate flag for backend
      models: autoRouterEnabled ? [] : models, // Clear fallback when auto-router is on
      // Note: Route is automatically set to 'fallback' if a fallback chain exists,
      // otherwise the user's selected route preference is used
      route: autoRouterEnabled ? 'auto' : (models.length > 0 ? 'fallback' : route),
      providerPreferences,
      maxCreditsPerRequest,
      includeReasoning,
    };
  },
});

export const openRouterEffectiveFallbackChainSelector = selector<string[]>({
  key: 'openRouterEffectiveFallbackChainSelector',
  get: ({ get }) => {
    const model = get(openRouterModelState);
    const fallbackChain = get(openRouterFallbackChainState);
    const autoRouterEnabled = get(openRouterAutoRouterEnabledState);

    // When auto-router is enabled, return empty array
    // (auto-router handles model selection internally)
    if (autoRouterEnabled) {
      return [];
    }

    // Return the fallback chain with the primary model prepended if not already included
    if (!fallbackChain.includes(model)) {
      return [model, ...fallbackChain];
    }

    return fallbackChain;
  },
});

// Helper selector to check if using Auto Router
export const isUsingAutoRouterSelector = selector<boolean>({
  key: 'isUsingAutoRouterSelector',
  get: ({ get }) => {
    // Only check the toggle state, not the model
    // This prevents the state contamination issue
    const autoRouterEnabled = get(openRouterAutoRouterEnabledState);
    return autoRouterEnabled;
  },
});

// New atoms for sorting and filtering
export const openRouterSortKeyState = atomWithLocalStorage<'provider' | 'name'>(
  'openRouterSortKey',
  'provider',
);

export const openRouterSortDirState = atomWithLocalStorage<'asc' | 'desc'>(
  'openRouterSortDir',
  'asc',
);

export const openRouterFilterNoTrainState = atomWithLocalStorage<boolean>(
  'openRouterFilterNoTrain',
  false, // Default: show all models
);

// Selector for sorted and filtered models
export const openRouterModelsDerivedSelector = selector<OpenRouterModel[]>({
  key: 'openRouterModelsDerivedSelector',
  get: ({ get }) => {
    const models = get(openRouterModelsListState);
    const sortKey = get(openRouterSortKeyState);
    const sortDir = get(openRouterSortDirState);
    const filterNoTrain = get(openRouterFilterNoTrainState);

    // Separate Auto Router from other models
    const autoRouter = models.find(m => m.id === 'openrouter/auto');
    const otherModels = models.filter(m => m.id !== 'openrouter/auto');

    // Import privacy utilities dynamically to avoid circular deps
    const { filterModelsByPrivacy, sortModels } = require('~/utils/openRouterPrivacy');

    // Apply privacy filter
    const filtered = filterModelsByPrivacy(otherModels, filterNoTrain);

    // Apply sorting
    const sorted = sortModels(filtered, sortKey, sortDir);

    // Return with Auto Router pinned at top
    return autoRouter ? [autoRouter, ...sorted] : sorted;
  },
});

// Export all atoms and selectors as default
export default {
  // Atoms
  openRouterModelState,
  openRouterFallbackChainState,
  openRouterAutoRouterEnabledState,
  openRouterRouteState,
  openRouterProviderPreferencesState,
  openRouterMaxCreditsPerRequestState,
  openRouterIncludeReasoningState,
  openRouterCreditsState,
  openRouterModelsListState,
  openRouterCreditsLoadingState,
  openRouterCreditsErrorState,
  openRouterActualModelState,
  openRouterSortKeyState,
  openRouterSortDirState,
  openRouterFilterNoTrainState,

  // Selectors
  openRouterConfigSelector,
  openRouterEffectiveFallbackChainSelector,
  isUsingAutoRouterSelector,
  openRouterModelsDerivedSelector,
};
