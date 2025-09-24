import { useRecoilValue } from 'recoil';
import {
  openRouterModelState,
  openRouterFallbackChainState,
  openRouterAutoRouterEnabledState,
  openRouterRouteState,
  openRouterProviderPreferencesState,
  openRouterMaxCreditsPerRequestState,
  openRouterIncludeReasoningState,
  openRouterZDREnabledState,
  type OpenRouterState,
} from '~/store/openrouter';

/**
 * Hook replacement for openRouterConfigSelector
 * Returns the complete OpenRouter configuration
 */
export function useOpenRouterConfig(): OpenRouterState & { autoRouter: boolean; zdrEnabled: boolean } {
  const model = useRecoilValue(openRouterModelState);
  const models = useRecoilValue(openRouterFallbackChainState);
  const route = useRecoilValue(openRouterRouteState);
  const providerPreferences = useRecoilValue(openRouterProviderPreferencesState);
  const maxCreditsPerRequest = useRecoilValue(openRouterMaxCreditsPerRequestState);
  const includeReasoning = useRecoilValue(openRouterIncludeReasoningState);
  const autoRouterEnabled = useRecoilValue(openRouterAutoRouterEnabledState);
  const zdrEnabled = useRecoilValue(openRouterZDREnabledState);

  // Pass auto-router as a separate flag, don't override the model
  // This maintains state isolation - UI shows user's selection,
  // backend handles the transformation to 'openrouter/auto'
  return {
    model, // Keep the user's selected model
    autoRouter: autoRouterEnabled, // Pass as separate flag for backend
    zdrEnabled, // Include ZDR setting
    models: autoRouterEnabled ? [] : models, // Clear fallback when auto-router is on
    // Note: Route is automatically set to 'fallback' if a fallback chain exists,
    // otherwise the user's selected route preference is used
    route: autoRouterEnabled ? 'auto' : (models.length > 0 ? 'fallback' : route),
    providerPreferences,
    maxCreditsPerRequest,
    includeReasoning,
  };
}

/**
 * Hook replacement for openRouterEffectiveFallbackChainSelector
 * Returns the effective fallback chain including the primary model
 */
export function useOpenRouterEffectiveFallbackChain(): string[] {
  const model = useRecoilValue(openRouterModelState);
  const fallbackChain = useRecoilValue(openRouterFallbackChainState);
  const autoRouterEnabled = useRecoilValue(openRouterAutoRouterEnabledState);

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
}

/**
 * Hook replacement for isUsingAutoRouterSelector
 * Returns whether auto-router is currently enabled
 */
export function useIsUsingAutoRouter(): boolean {
  // Only check the toggle state, not the model
  // This prevents the state contamination issue
  const autoRouterEnabled = useRecoilValue(openRouterAutoRouterEnabledState);
  return autoRouterEnabled;
}