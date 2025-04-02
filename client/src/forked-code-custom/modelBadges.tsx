import { useEffect, useState, memo, useMemo } from 'react';
import React from 'react';
import type { TModelSpec } from 'librechat-data-provider';
import { User, Server, Gift, Target } from 'lucide-react';
import { TooltipAnchor } from '../components/ui/Tooltip';

/**
 * Pricing data cache from LiteLLM
 */
let pricingData: Record<string, { input_cost_per_token?: number; output_cost_per_token?: number }> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Cache of model matches to avoid redundant matching operations
const modelMatchCache: Record<string, { model: string; data: any } | null> = {};

/**
 * Format price value for display (per million tokens)
 */
export const formatPrice = (value: number): string => {
  if (value === 0) return '0.00';
  
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
 * Find matching model in pricing data with simplified approach
 * Preserves provider information for accurate pricing
 */
export const findBestModelMatch = (
  modelName: string, 
  pricingData: Record<string, any>
): { model: string; data: any } | null => {
  if (!modelName || !pricingData) return null;
  
  // Check cache first
  if (modelMatchCache[modelName] !== undefined) {
    return modelMatchCache[modelName];
  }
  
  // Step 1: Try exact match first (highest priority)
  if (pricingData[modelName]) {
    console.log(`Model exact match: '${modelName}'`);
    const result = { model: modelName, data: pricingData[modelName] };
    modelMatchCache[modelName] = result;
    return result;
  }
  
  // Step 2: Try with or without the "gemini/" prefix
  const hasGeminiPrefix = modelName.startsWith('gemini/');
  const withoutGeminiPrefix = hasGeminiPrefix ? modelName.substring(7) : modelName;
  const withGeminiPrefix = hasGeminiPrefix ? modelName : `gemini/${modelName}`;
  
  // Check the variant without or with the prefix
  if (hasGeminiPrefix && pricingData[withoutGeminiPrefix]) {
    console.log(`Model matched without gemini/ prefix: '${modelName}' → '${withoutGeminiPrefix}'`);
    const result = { model: withoutGeminiPrefix, data: pricingData[withoutGeminiPrefix] };
    modelMatchCache[modelName] = result;
    return result;
  }
  
  if (!hasGeminiPrefix && pricingData[withGeminiPrefix]) {
    console.log(`Model matched with gemini/ prefix: '${modelName}' → '${withGeminiPrefix}'`);
    const result = { model: withGeminiPrefix, data: pricingData[withGeminiPrefix] };
    modelMatchCache[modelName] = result;
    return result;
  }
  
  // Step 3: Try case-insensitive exact match
  const lowercaseModelName = modelName.toLowerCase();
  for (const key in pricingData) {
    if (key.toLowerCase() === lowercaseModelName) {
      console.log(`Model case-insensitive match: '${modelName}' → '${key}'`);
      const result = { model: key, data: pricingData[key] };
      modelMatchCache[modelName] = result;
      return result;
    }
  }
  
  // Step 4: Try case-insensitive match with or without gemini/ prefix
  const lowercaseWithoutPrefix = withoutGeminiPrefix.toLowerCase();
  const lowercaseWithPrefix = withGeminiPrefix.toLowerCase();
  
  for (const key in pricingData) {
    const lowercaseKey = key.toLowerCase();
    if (lowercaseKey === lowercaseWithoutPrefix || lowercaseKey === lowercaseWithPrefix) {
      console.log(`Model case-insensitive match with/without gemini/ prefix: '${modelName}' → '${key}'`);
      const result = { model: key, data: pricingData[key] };
      modelMatchCache[modelName] = result;
      return result;
    }
  }
  
  // Step 5: Try matching after removing custom suffixes (-reasoning, -high, -low)
  const suffixRegex = /-(?:reasoning|high|low)$/;
  if (suffixRegex.test(modelName)) {
    const baseModelName = modelName.replace(suffixRegex, '');
    
    // Try exact match with base model name
    if (pricingData[baseModelName]) {
      console.log(`Model matched after removing suffix: '${modelName}' → '${baseModelName}'`);
      const result = { model: baseModelName, data: pricingData[baseModelName] };
      modelMatchCache[modelName] = result;
      return result;
    }
    
    // Try with or without the "gemini/" prefix on the base model name
    const baseHasGeminiPrefix = baseModelName.startsWith('gemini/');
    const baseWithoutGeminiPrefix = baseHasGeminiPrefix ? baseModelName.substring(7) : baseModelName;
    const baseWithGeminiPrefix = baseHasGeminiPrefix ? baseModelName : `gemini/${baseModelName}`;
    
    if (baseHasGeminiPrefix && pricingData[baseWithoutGeminiPrefix]) {
      console.log(`Model matched after removing suffix and gemini/ prefix: '${modelName}' → '${baseWithoutGeminiPrefix}'`);
      const result = { model: baseWithoutGeminiPrefix, data: pricingData[baseWithoutGeminiPrefix] };
      modelMatchCache[modelName] = result;
      return result;
    }
    
    if (!baseHasGeminiPrefix && pricingData[baseWithGeminiPrefix]) {
      console.log(`Model matched after removing suffix and adding gemini/ prefix: '${modelName}' → '${baseWithGeminiPrefix}'`);
      const result = { model: baseWithGeminiPrefix, data: pricingData[baseWithGeminiPrefix] };
      modelMatchCache[modelName] = result;
      return result;
    }
    
    // Try case-insensitive match with base model name
    const lowercaseBaseModelName = baseModelName.toLowerCase();
    for (const key in pricingData) {
      if (key.toLowerCase() === lowercaseBaseModelName) {
        console.log(`Model matched after removing suffix (case-insensitive): '${modelName}' → '${key}'`);
        const result = { model: key, data: pricingData[key] };
        modelMatchCache[modelName] = result;
        return result;
      }
    }
    
    // Try case-insensitive match with or without gemini/ prefix on base model name
    const lowercaseBaseWithoutPrefix = baseWithoutGeminiPrefix.toLowerCase();
    const lowercaseBaseWithPrefix = baseWithGeminiPrefix.toLowerCase();
    
    for (const key in pricingData) {
      const lowercaseKey = key.toLowerCase();
      if (lowercaseKey === lowercaseBaseWithoutPrefix || lowercaseKey === lowercaseBaseWithPrefix) {
        console.log(`Model case-insensitive match after removing suffix with/without gemini/ prefix: '${modelName}' → '${key}'`);
        const result = { model: key, data: pricingData[key] };
        modelMatchCache[modelName] = result;
        return result;
      }
    }
  }
  
  // No match found
  console.log(`No match found for model: '${modelName}'`);
  modelMatchCache[modelName] = null;
  return null;
};

/**
 * Fetch pricing data from LiteLLM
 */
export const fetchPricingData = async (): Promise<Record<string, any>> => {
  const now = Date.now();
  
  // Use cached data if available and fresh
  if (pricingData && now - lastFetchTime < CACHE_DURATION) {
    return pricingData;
  }
  
  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch pricing data: ${response.status}`);
    }
    
    const data = await response.json();
    pricingData = data;
    lastFetchTime = now;
    
    // Reset the model match cache when we get new pricing data
    Object.keys(modelMatchCache).forEach(key => delete modelMatchCache[key]);
    
    return data;
  } catch (error) {
    console.error('Error fetching pricing data:', error);
    // Return empty object if fetch fails
    return {};
  }
};

/**
 * Price badge component for displaying input and output prices
 * Memoized to prevent unnecessary re-renders
 */
export const PriceBadge = memo(({ 
  type, 
  price 
}: { 
  type: 'input' | 'output';
  price: number;
}) => {
  const isInput = type === 'input';
  
  // Display the price value directly without further conversion
  // since it's already per million tokens
  const formattedPrice = price.toFixed(price >= 100 ? 0 : price >= 10 ? 1 : 2);
  const tooltipText = `$${formattedPrice} per 1 million tokens`;
  
  return (
    <TooltipAnchor 
      description={tooltipText}
      side="top"
      className="cursor-pointer"
    >
      <div 
        className="flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
        style={{ minWidth: "76px" }}
      >
        {isInput ? (
          <User size={12} className="text-text-primary" strokeWidth={1.5} />
        ) : (
          <Server size={12} className="text-text-primary" strokeWidth={1.5} />
        )}
        <span className="text-[10px] text-text-primary">
          ${formattedPrice}/1M
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
  return (
    <div 
      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
      style={{ minWidth: "76px" }}
    >
      <Gift size={14} className="text-orange-400" strokeWidth={1.5} />
      <span className="text-[10px] text-text-primary">
        Currently free
      </span>
    </div>
  );
});

/**
 * Context window badge component for displaying max tokens
 * Memoized to prevent unnecessary re-renders
 */
export const ContextBadge = memo(({ 
  tokens 
}: { 
  tokens: number;
}) => {
  const formattedTokens = formatTokenCount(tokens);
  const tooltipText = "Max Context Tokens";
  
  return (
    <TooltipAnchor 
      description={tooltipText}
      side="top"
      className="cursor-pointer"
    >
      <div 
        className="flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
        style={{ minWidth: "61px" }}
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
  disabled
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

// Singleton instance for global pricing data
let globalPricingData: Record<string, any> | null = null;
let globalPricingDataPromise: Promise<Record<string, any>> | null = null;

/**
 * Initialize pricing data once at the application level
 * Returns a promise that resolves when data is loaded
 */
export const initPricingData = async (): Promise<Record<string, any>> => {
  if (!globalPricingDataPromise) {
    globalPricingDataPromise = fetchPricingData().then(data => {
      globalPricingData = data;
      return data;
    });
  }
  return globalPricingDataPromise;
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
    disabled: false
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
        disabled: false
      };
      
      // Check for badges configuration and apply available properties
      if (spec.badges) {
        const { inputPrice, outputPrice, showPricing = true, isFree = false, maxContextToken, disabled = false } = spec.badges;
        badgeData = {
          ...badgeData,
          inputPrice: inputPrice ?? badgeData.inputPrice,
          outputPrice: outputPrice ?? badgeData.outputPrice,
          showPricing,
          isFree,
          maxTokens: maxContextToken ?? badgeData.maxTokens,
          disabled
        };
      }
      
      // If we have missing data and model name is provided, try to get from LiteLLM
      const needsMoreData = !badgeData.disabled && 
        modelName && 
        (badgeData.maxTokens === null || badgeData.inputPrice === null || badgeData.outputPrice === null);
        
      if (needsMoreData) {
        try {
          // Use already fetched data if available, otherwise initialize
          const data = globalPricingData || await initPricingData();
          
          // Use the simplified model matching function
          const modelMatch = findBestModelMatch(modelName, data);
          
          if (modelMatch && isMounted) {
            const modelData = modelMatch.data;
            
            // Only override values that weren't explicitly set in the badges config
            if (badgeData.inputPrice === null && modelData.input_cost_per_token !== undefined) {
              badgeData.inputPrice = modelData.input_cost_per_token * 1000000;
            }
              
            if (badgeData.outputPrice === null && modelData.output_cost_per_token !== undefined) {
              badgeData.outputPrice = modelData.output_cost_per_token * 1000000;
            }
            
            // Get max tokens if not already specified
            if (badgeData.maxTokens === null && modelData.max_input_tokens !== undefined) {
              badgeData.maxTokens = modelData.max_input_tokens;
            }
            
            // Check if both input and output costs are 0 (free model)
            // Only update isFree if it wasn't explicitly set
            if (!spec.badges?.isFree && badgeData.inputPrice === 0 && badgeData.outputPrice === 0) {
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
  return useMemo(() => badges, [
    badges.inputPrice, 
    badges.outputPrice, 
    badges.showPricing, 
    badges.isFree,
    badges.maxTokens,
    badges.disabled
  ]);
}; 