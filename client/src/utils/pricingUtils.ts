import { useEffect, useState } from 'react';
import type { TModelSpec } from 'librechat-data-provider';

/**
 * Pricing data cache from LiteLLM
 */
let pricingData: Record<string, { input_cost_per_token?: number; output_cost_per_token?: number }> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

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
    return data;
  } catch (error) {
    console.error('Error fetching pricing data:', error);
    // Return empty object if fetch fails
    return {};
  }
};

/**
 * Price badge component for displaying input and output prices
 * This helps avoid merge conflicts by keeping the component in a single file
 */
export const PriceBadge = ({ 
  type, 
  price 
}: { 
  type: 'input' | 'output';
  price: number;
}) => {
  const isInput = type === 'input';
  const bgGradient = isInput 
    ? 'bg-gradient-to-r from-blue-900/30 to-blue-800/20' 
    : 'bg-gradient-to-r from-purple-900/30 to-purple-800/20';
  const borderColor = isInput ? 'rgb(147, 197, 253)' : 'rgb(216, 180, 254)';
  const textColor = isInput ? 'rgb(147, 197, 253)' : 'rgb(216, 180, 254)';
  const label = isInput ? 'IN' : 'OUT';
  
  const formattedPrice = price.toFixed(price >= 100 ? 0 : price >= 10 ? 1 : 2);
  
  return (
    <div 
      className="flex items-center gap-1 px-2.5 py-0.75 rounded-full" 
      style={{ 
        border: `0.5px solid ${borderColor}`,
        background: bgGradient
      }}
    >
      <span 
        className="text-[10px] font-semibold" 
        style={{ color: textColor }}
      >
        {label} ${formattedPrice}/1M
      </span>
    </div>
  );
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
        const { inputPrice, outputPrice, showPricing = true } = spec.pricing;
        if (isMounted) {
          setPrices({
            inputPrice: inputPrice ?? null,
            outputPrice: outputPrice ?? null,
            showPricing
          });
          return;
        }
      }
      
      // If no manual pricing, try to get from LiteLLM
      if (modelName) {
        try {
          const data = await fetchPricingData();
          const modelData = data?.[modelName];
          
          if (modelData && isMounted) {
            setPrices({
              inputPrice: modelData.input_cost_per_token ? modelData.input_cost_per_token * 1000000 : null,
              outputPrice: modelData.output_cost_per_token ? modelData.output_cost_per_token * 1000000 : null,
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
  
  return prices;
}; 