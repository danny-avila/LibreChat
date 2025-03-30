import { useEffect, useState, memo, useMemo } from 'react';
import React from 'react';
import type { TModelSpec } from 'librechat-data-provider';
import { User, Server, Gift } from 'lucide-react';

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
  
  // Step 2: Try case-insensitive exact match
  const lowercaseModelName = modelName.toLowerCase();
  for (const key in pricingData) {
    if (key.toLowerCase() === lowercaseModelName) {
      console.log(`Model case-insensitive match: '${modelName}' → '${key}'`);
      const result = { model: key, data: pricingData[key] };
      modelMatchCache[modelName] = result;
      return result;
    }
  }
  
  // Step 3: Try matching after removing custom suffixes (-reasoning, -high, -low)
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
  
  return (
    <div 
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
    >
      {isInput ? (
        <User size={12} className="text-text-primary" strokeWidth={2.5} />
      ) : (
        <Server size={12} className="text-text-primary" strokeWidth={2.5} />
      )}
      <span className="text-[10px] font-medium text-text-primary">
        ${formattedPrice}/1M
      </span>
    </div>
  );
});

/**
 * Free badge component for free models
 * Memoized to prevent unnecessary re-renders
 */
export const FreeBadge = memo(() => {
  return (
    <div 
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
    >
      <Gift size={12} className="text-text-primary" strokeWidth={2.5} />
      <span className="text-[10px] font-medium text-text-primary">
        Free
      </span>
    </div>
  );
});

/**
 * Pre-memoized pricing badges component to keep ModelSpecItem clean
 */
export const PricingBadges = memo(({ 
  inputPrice, 
  outputPrice, 
  showPricing,
  isFree
}: { 
  inputPrice: number | null; 
  outputPrice: number | null; 
  showPricing: boolean;
  isFree?: boolean;
}) => {
  // Show Free badge if isFree is true, regardless of other pricing
  if (isFree) {
    return <FreeBadge />;
  }
  
  // Otherwise show regular pricing badges if applicable
  if (!showPricing || (inputPrice === null && outputPrice === null)) {
    return null;
  }
  
  return (
    <div className="flex items-center gap-2">
      {inputPrice !== null && (
        <PriceBadge type="input" price={inputPrice} />
      )}
      {outputPrice !== null && (
        <PriceBadge type="output" price={outputPrice} />
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
 * Hook to get model pricing data
 * First tries to use manual configuration, then falls back to LiteLLM data
 */
export const useModelPricing = (spec: TModelSpec) => {
  const [prices, setPrices] = useState<{ 
    inputPrice: number | null; 
    outputPrice: number | null;
    showPricing: boolean;
    isFree?: boolean;
  }>({
    inputPrice: null,
    outputPrice: null,
    showPricing: false
  });
  
  const modelName = spec.preset?.model || '';
  
  useEffect(() => {
    let isMounted = true;
    
    const getPricing = async () => {
      // First check for manual pricing configuration
      if (spec.pricing) {
        const { inputPrice, outputPrice, showPricing = true, isFree = false } = spec.pricing;
        if (isMounted) {
          setPrices({
            inputPrice: inputPrice ?? null,
            outputPrice: outputPrice ?? null,
            showPricing,
            isFree
          });
          return;
        }
      }
      
      // If no manual pricing, try to get from LiteLLM
      if (modelName) {
        try {
          // Use already fetched data if available, otherwise initialize
          const data = globalPricingData || await initPricingData();
          
          // Use the simplified model matching function
          const modelMatch = findBestModelMatch(modelName, data);
          
          if (modelMatch && isMounted) {
            const modelData = modelMatch.data;
            
            // Calculate prices once
            const inputCost = modelData.input_cost_per_token 
              ? modelData.input_cost_per_token * 1000000 
              : null;
              
            const outputCost = modelData.output_cost_per_token 
              ? modelData.output_cost_per_token * 1000000 
              : null;
            
            setPrices({
              inputPrice: inputCost,
              outputPrice: outputCost,
              showPricing: true
            });
          }
        } catch (error) {
          console.error('Error fetching model pricing:', error);
        }
      }
    };
    
    getPricing();
    return () => { isMounted = false; };
  }, [spec, modelName]);
  
  // Memoize the returned object to prevent unnecessary re-renders
  return useMemo(() => prices, [
    prices.inputPrice, 
    prices.outputPrice, 
    prices.showPricing, 
    prices.isFree
  ]);
}; 