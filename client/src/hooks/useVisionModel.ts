import { useMemo } from 'react';
import { validateVisionModel } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useGetStartupConfig } from '~/data-provider';

/**
 * Hook to determine if the current conversation model supports vision capabilities.
 * Checks modelSpecs configuration first, then falls back to hardcoded list.
 */
export function useVisionModel(): boolean {
  const { conversation } = useChatContext();
  const { data: startupConfig } = useGetStartupConfig();

  return useMemo(() => {
    const model = conversation?.model;
    if (!model) {
      return false;
    }
    
    return validateVisionModel({
      model,
      modelSpecs: startupConfig?.modelSpecs,
    });
  }, [conversation?.model, startupConfig?.modelSpecs]);
}
