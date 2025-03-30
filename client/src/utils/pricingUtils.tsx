import { useEffect, useState } from 'react';
import React from 'react';
import type { TModelSpec } from 'librechat-data-provider';

/**
 * Pricing data cache from LiteLLM
 */
let pricingData: Record<string, { input_cost_per_token?: number; output_cost_per_token?: number }> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Common model name prefixes to remove for better matching
 */
const MODEL_PREFIXES = [
  'openai/', 'gemini/', 'perplexity/', 'anthropic/', 'bedrock/', 'bedrock/converse/',
  'cohere/', 'mistral/', 'azure/', 'meta/', 'together/', 'microsoft/'
];

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
 * Normalize a model name for better matching
 * - Removes common provider prefixes
 * - Converts to lowercase
 * - Standardizes version separators
 * - Removes suffixes like '-latest', '-high', '-low', etc.
 */
export const normalizeModelName = (modelName: string): string => {
  let normalized = modelName.toLowerCase();
  
  // Remove common prefixes
  for (const prefix of MODEL_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length);
      break;
    }
  }

  // Standardize version number formats (e.g., convert dots to dashes in version numbers)
  normalized = normalized.replace(/(\d+)\.(\d+)/g, '$1-$2');
  
  // Remove common suffixes that don't affect the core model identity
  const commonSuffixes = [
    '-latest', '-preview', '-high', '-low', '-reasoning', '-turbo', '-vision',
    '-0314', '-0613', '-0301', '-1106', '-0125', '-2402', '-2407', '-2024-05-13', '-2024-08-06'
  ];
  
  for (const suffix of commonSuffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.substring(0, normalized.length - suffix.length);
      break;
    }
  }
  
  return normalized;
};

/**
 * Calculate similarity score between two strings
 * Higher score means more similar
 */
export const calculateSimilarity = (str1: string, str2: string): number => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  // Perfect match
  if (longer === shorter) return 1.0;
  
  // One is a substring of the other
  if (longer.includes(shorter)) {
    // Score based on length ratio and position
    const lengthRatio = shorter.length / longer.length;
    const position = longer.indexOf(shorter) / longer.length;
    // Prefer matches that start at the beginning
    return lengthRatio * (1 - position * 0.5);
  }
  
  // Calculate word intersection
  const longerWords = longer.split(/[-_. ]/);
  const shorterWords = shorter.split(/[-_. ]/);
  
  let matches = 0;
  let exactWordMatches = 0;
  
  for (const word1 of shorterWords) {
    if (word1.length < 2) continue; // Skip very short segments
    
    let bestMatchScore = 0;
    for (const word2 of longerWords) {
      if (word2.length < 2) continue;
      
      if (word1 === word2) {
        // Exact word match gets higher score
        exactWordMatches++;
        matches++;
        break;
      } else if (word1.includes(word2) || word2.includes(word1)) {
        // Partial match
        const matchScore = Math.min(word1.length, word2.length) / Math.max(word1.length, word2.length);
        if (matchScore > bestMatchScore) {
          bestMatchScore = matchScore;
        }
      }
    }
    
    if (bestMatchScore > 0) {
      matches += bestMatchScore;
    }
  }
  
  // Score formula with higher weight for exact word matches
  if (shorterWords.length > 0) {
    const wordMatchScore = matches / shorterWords.length;
    const exactMatchBonus = exactWordMatches / shorterWords.length * 0.2; // Bonus for exact matches
    return Math.min(wordMatchScore + exactMatchBonus, 0.95); // Cap at 0.95 to reserve 1.0 for perfect matches
  }
  
  return 0;
};

/**
 * Find the best matching model in pricing data
 * Uses multiple strategies to find the best match
 */
export const findBestModelMatch = (
  modelName: string, 
  pricingData: Record<string, any>
): { model: string; data: any } | null => {
  if (!modelName || !pricingData) return null;
  
  // Step 1: Try exact match first (highest priority)
  if (pricingData[modelName]) {
    console.log(`Model exact match: '${modelName}'`);
    return { model: modelName, data: pricingData[modelName] };
  }
  
  // Step 2: Try case-insensitive exact match
  const lowercaseModelName = modelName.toLowerCase();
  for (const key in pricingData) {
    if (key.toLowerCase() === lowercaseModelName) {
      console.log(`Model case-insensitive match: '${modelName}' → '${key}'`);
      return { model: key, data: pricingData[key] };
    }
  }
  
  // Step 3: Try normalized exact match
  const normalized = normalizeModelName(modelName);
  for (const key in pricingData) {
    const normalizedKey = normalizeModelName(key);
    if (normalizedKey === normalized) {
      console.log(`Model normalized match: '${modelName}' → '${key}'`);
      return { model: key, data: pricingData[key] };
    }
  }
  
  // Step 4: Fuzzy matching with similarity scoring
  let bestMatch: { model: string; data: any; score: number } | null = null;
  let bestScore = 0;
  
  for (const key in pricingData) {
    const normalizedKey = normalizeModelName(key);
    
    // Calculate similarity score
    const score = calculateSimilarity(normalized, normalizedKey);
    
    // Keep track of best match
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { model: key, data: pricingData[key], score };
    }
  }
  
  // Only return matches that are reasonably similar (threshold of 0.5)
  if (bestMatch && bestScore >= 0.5) {
    console.log(`Model fuzzy match: '${modelName}' → '${bestMatch.model}' (score: ${bestScore.toFixed(2)})`);
    return { model: bestMatch.model, data: bestMatch.data };
  }
  
  // No good match found
  console.log(`No good match found for model: '${modelName}'`);
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
          // Use the improved model matching function
          const modelMatch = findBestModelMatch(modelName, data);
          
          if (modelMatch && isMounted) {
            const modelData = modelMatch.data;
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