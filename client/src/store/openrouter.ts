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

    // Auto Router disabled to fix issue
    // if (autoRouterEnabled) {
    //   return {
    //     model: 'openrouter/auto', // Explicitly use auto-router
    //     models: [],
    //     route: 'auto',
    //     providerPreferences,
    //     maxCreditsPerRequest,
    //     includeReasoning,
    //   };
    // }

    return {
      model,
      models,
      // Note: Route is automatically set to 'fallback' if a fallback chain exists,
      // otherwise the user's selected route preference is used
      route: models.length > 0 ? 'fallback' : route,
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

    // Auto Router disabled to fix issue
    // if (autoRouterEnabled || model === 'openrouter/auto') {
    //   return [];
    // }

    // Return the fallback chain with the primary model prepended if not already included
    if (!fallbackChain.includes(model)) {
      return [model, ...fallbackChain];
    }

    return fallbackChain;
  },
});

// Helper selector to check if using Auto Router
// Disabled to fix issue
/*
export const isUsingAutoRouterSelector = selector<boolean>({
  key: 'isUsingAutoRouterSelector',
  get: ({ get }) => {
    const model = get(openRouterModelState);
    const autoRouterEnabled = get(openRouterAutoRouterEnabledState);
    return autoRouterEnabled || model === 'openrouter/auto';
  },
});
*/

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

  // Selectors
  openRouterConfigSelector,
  openRouterEffectiveFallbackChainSelector,
  // isUsingAutoRouterSelector, // Removed - was causing undefined reference error
};
