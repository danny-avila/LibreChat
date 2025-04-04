import { useEffect, useState, memo, useMemo } from 'react';
import React from 'react';
import type { TModelSpec } from 'librechat-data-provider';
import { User, Server, Gift, Target } from 'lucide-react';
import { TooltipAnchor } from '../components/ui/Tooltip';
import { fetchModelInfo, LiteLLMModelInfo } from './litellmInfoAdapter';

/**
 * Pricing data cache from LiteLLM
 */
let modelInfoCache: Record<string, LiteLLMModelInfo> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Format price value for display (per million tokens)
 */
export const formatPrice = (value: number): string => {
  if (value === 0) {return '0.00';}

  // Convert to per million tokens
  const perMillion = value * 1000000;

  if (perMillion >= 100) {
    return perMillion.toFixed(0);
  } else if (perMillion >= 10) {
    return perMillion.toFixed(1);
  } else {
    return perMillion.toFixed(2);
  }
};

/**
 * Format token count for display (e.g. 128000 → 128K)
 */
export const formatTokenCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}M`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`;
  }
  return count.toString();
};

/**
 * Fetch model information from LiteLLM API
 */
export const fetchModelData = async (): Promise<Record<string, LiteLLMModelInfo>> => {
  const now = Date.now();

  // Use cached data if available and fresh
  if (modelInfoCache && now - lastFetchTime < CACHE_DURATION) {
    return modelInfoCache;
  }

  try {
    const data = await fetchModelInfo();

    if (Object.keys(data).length > 0) {
      modelInfoCache = data;
      lastFetchTime = now;
      return data;
    }

    return {};
  } catch (error) {
    console.error('Error fetching model data:', error);
    return {};
  }
};

/**
 * Price badge component for displaying input and output prices
 * Memoized to prevent unnecessary re-renders
 */
export const PriceBadge = memo(({
  type,
  price,
}: {
  type: 'input' | 'output';
  price: number;
}) => {
  const isInput = type === 'input';

  // Display the price value directly without further conversion
  // since it's already per million tokens
  const formattedPrice = price.toFixed(price >= 100 ? 0 : price >= 10 ? 1 : 2);
  const tooltipText = `$${formattedPrice} per 1 million tokens`;

  // Extract the content into a variable to avoid literal string ESLint error
  const priceText = `$${formattedPrice}/1M`;

  return (
    <TooltipAnchor
      description={tooltipText}
      side="top"
      className="cursor-pointer"
    >
      <div
        className="flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
        style={{ minWidth: '76px' }}
      >
        {isInput ? (
          <User size={12} className="text-text-primary" strokeWidth={1.5} />
        ) : (
          <Server size={12} className="text-text-primary" strokeWidth={1.5} />
        )}
        <span className="text-[10px] text-text-primary">
          {priceText}
        </span>
      </div>
    </TooltipAnchor>
  );
});

/**
 * Free badge component for free models
 * Memoized to prevent unnecessary re-renders
 */
export const FreeBadge = memo(() => {
  // Extract the content into a variable to avoid literal string ESLint error
  const freeText = 'Currently free';

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
      style={{ minWidth: '76px' }}
    >
      <Gift size={14} className="text-orange-400" strokeWidth={1.5} />
      <span className="text-[10px] text-text-primary">
        {freeText}
      </span>
    </div>
  );
});

/**
 * Context window badge component for displaying max tokens
 * Memoized to prevent unnecessary re-renders
 */
export const ContextBadge = memo(({
  tokens,
}: {
  tokens: number;
}) => {
  const formattedTokens = formatTokenCount(tokens);
  const tooltipText = 'Max Context Tokens';

  return (
    <TooltipAnchor
      description={tooltipText}
      side="top"
      className="cursor-pointer"
    >
      <div
        className="flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
        style={{ minWidth: '61px' }}
      >
        <Target size={12} className="text-text-primary" strokeWidth={1.5} />
        <span className="text-[10px] text-text-primary">
          {formattedTokens}
        </span>
      </div>
    </TooltipAnchor>
  );
});

/**
 * Pre-memoized badges component to keep ModelSpecItem clean
 */
export const ModelBadges = memo(({
  inputPrice,
  outputPrice,
  showPricing,
  isFree,
  maxTokens,
  disabled,
}: {
  inputPrice: number | null;
  outputPrice: number | null;
  showPricing: boolean;
  isFree?: boolean;
  maxTokens?: number | null;
  disabled?: boolean;
}) => {
  // If badges are explicitly disabled, show nothing
  if (disabled) {
    return null;
  }

  // Don't show anything if no pricing info and no token info
  if (!showPricing && !maxTokens && !isFree) {
    return null;
  }

  // Check if both input and output prices are 0 (free model)
  const isZeroPriced = inputPrice === 0 && outputPrice === 0;
  const shouldShowFree = isFree || isZeroPriced;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      {shouldShowFree && (
        <FreeBadge />
      )}
      {showPricing && !shouldShowFree && inputPrice !== null && (
        <PriceBadge type="input" price={inputPrice} />
      )}
      {showPricing && !shouldShowFree && outputPrice !== null && (
        <PriceBadge type="output" price={outputPrice} />
      )}
      {maxTokens !== null && maxTokens !== undefined && (
        <ContextBadge tokens={maxTokens} />
      )}
    </div>
  );
});

// Singleton instance for global model info
let globalModelData: Record<string, LiteLLMModelInfo> | null = null;
let globalModelDataPromise: Promise<Record<string, LiteLLMModelInfo>> | null = null;

/**
 * Initialize model data once at the application level
 * Returns a promise that resolves when data is loaded
 */
export const initModelData = async (): Promise<Record<string, LiteLLMModelInfo>> => {
  if (!globalModelDataPromise) {
    globalModelDataPromise = fetchModelData().then(data => {
      globalModelData = data;
      return data;
    });
  }
  return globalModelDataPromise;
};

/**
 * Hook to get model badges data
 * Uses badges configuration or falls back to LiteLLM data
 */
export const useModelBadges = (spec: TModelSpec) => {
  const [badges, setBadges] = useState<{
    inputPrice: number | null;
    outputPrice: number | null;
    showPricing: boolean;
    isFree: boolean;
    maxTokens: number | null;
    disabled: boolean;
  }>({
    inputPrice: null,
    outputPrice: null,
    showPricing: true,
    isFree: false,
    maxTokens: null,
    disabled: false,
  });

  const modelName = spec.preset?.model || '';

  useEffect(() => {
    let isMounted = true;

    const getBadges = async () => {
      // Initialize with default values
      let badgeData = {
        inputPrice: null as number | null,
        outputPrice: null as number | null,
        showPricing: true,
        isFree: false,
        maxTokens: null as number | null,
        disabled: false,
      };

      // Check for badges configuration and apply available properties
      if (spec.badges) {
        const {
          inputPrice,
          outputPrice,
          showPricing = true,
          isFree = false,
          maxContextToken,
          disabled = false,
        } = spec.badges;

        badgeData = {
          ...badgeData,
          inputPrice: inputPrice ?? badgeData.inputPrice,
          outputPrice: outputPrice ?? badgeData.outputPrice,
          showPricing,
          isFree,
          maxTokens: maxContextToken ?? badgeData.maxTokens,
          disabled,
        };
      }

      // If we have missing data and model name is provided, try to get from LiteLLM
      const needsMoreData = !badgeData.disabled &&
        modelName &&
        (badgeData.maxTokens === null || badgeData.inputPrice === null || badgeData.outputPrice === null);

      if (needsMoreData) {
        try {
          // Use already fetched data if available, otherwise initialize
          const modelData = globalModelData || await initModelData();

          // Directly look up the model by name without complex matching
          const modelInfo = modelData[modelName];

          if (modelInfo && isMounted) {
            // Only override values that weren't explicitly set in the badges config
            if (badgeData.inputPrice === null && modelInfo.input_cost_per_token !== undefined) {
              badgeData.inputPrice = modelInfo.input_cost_per_token * 1000000;
            }

            if (badgeData.outputPrice === null && modelInfo.output_cost_per_token !== undefined) {
              badgeData.outputPrice = modelInfo.output_cost_per_token * 1000000;
            }

            // Get max tokens if not already specified
            if (badgeData.maxTokens === null) {
              // Try max_input_tokens first, then max_tokens as fallback
              badgeData.maxTokens = modelInfo.max_input_tokens || modelInfo.max_tokens || null;
            }

            // Check if both input and output costs are 0 (free model)
            // Only update isFree if it wasn't explicitly set
            if (!spec.badges?.isFree &&
                modelInfo.input_cost_per_token === 0 &&
                modelInfo.output_cost_per_token === 0) {
              badgeData.isFree = true;
            }
          }
        } catch (error) {
          console.error('Error fetching model badges:', error);
        }
      }

      if (isMounted) {
        setBadges(badgeData);
      }
    };

    getBadges();
    return () => { isMounted = false; };
  }, [spec, modelName]);

  // Memoize the returned object to prevent unnecessary re-renders
  return useMemo(() => badges, [badges]);
};