import React, { useMemo } from 'react';
import { SelectDropDown } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import type { TModelSelectProps } from '~/common';
import SelectDropDownPop from '~/components/Input/ModelSelect/SelectDropDownPop';
import { cn, cardStyle } from '~/utils';
import useAuthContext from '~/hooks/Authentication/useAuthContext';


export default function OpenRouter({
  conversation,
  setOption,
  models,
  showAbove,
  popover = false,
}: TModelSelectProps) {
  const { token } = useAuthContext();

  // Fetch OpenRouter models with pricing
  const { data: openRouterModels } = useQuery({
    queryKey: ['openRouterModels'],
    queryFn: async () => {
      const response = await fetch('/api/endpoints/openrouter/models', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch OpenRouter models');
      }
      return response.json();
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  // Get available models from API or fallback to provided models
  const availableModels = useMemo(() => {
    if (openRouterModels?.data && Array.isArray(openRouterModels.data)) {
      return openRouterModels.data.map((model: any) => model.id).filter(Boolean);
    }
    return models || [];
  }, [models, openRouterModels]);

  const Menu = popover ? SelectDropDownPop : SelectDropDown;

  // Use the conversation model with proper fallback
  const currentModel = conversation?.model ?? '';

  return (
    <Menu
      value={currentModel}
      setValue={setOption('model')}
      availableValues={availableModels}
      showAbove={showAbove}
      showLabel={false}
      className={cn(
        cardStyle,
        'z-50 flex h-[40px] w-56 min-w-56 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer',
      )}
    />
  );
}
