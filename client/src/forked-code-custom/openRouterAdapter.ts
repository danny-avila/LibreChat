import { useState, useEffect } from 'react';

// Type definitions for OpenRouter API response
export interface OpenRouterResponse {
  data: OpenRouterModelData[];
}

export interface OpenRouterModelData {
  id: string;
  name: string;
  created: number; // Unix timestamp
  context_length: number;
  pricing?: {
    prompt: number;
    completion: number;
  };
  description?: string;
  developer?: string;
}

// Configuration constants
const CACHE_DURATION = 60 * 60 * 1000; // Cache for 1 hour
const NEW_MODEL_DAYS_THRESHOLD = 7; // Consider models newer than this many days as "new"

// Cache mechanism
let openRouterModelCache: Record<string, OpenRouterModelData> | null = null;
let lastFetchTime = 0;

// Singleton promise for initialization
let openRouterDataPromise: Promise<Record<string, OpenRouterModelData>> | null = null;

/**
 * Normalize a model name for better matching by removing
 * non-alphanumeric chars and converting to lowercase
 */
export const normalizeModelName = (modelName: string): string => {
  return modelName.toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Fetch model information from OpenRouter API
 * and transform it into a more usable format
 */
export const fetchOpenRouterModels = async (): Promise<Record<string, OpenRouterModelData>> => {
  const now = Date.now();

  // Use cached data if available and fresh
  if (openRouterModelCache && now - lastFetchTime < CACHE_DURATION) {
    return openRouterModelCache;
  }

  try {
    // Fetch directly from OpenRouter API (no auth required)
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      // Don't throw, just log and return empty data
      console.warn(`OpenRouter API returned status ${response.status}`);
      return {};
    }

    const responseData = await response.json() as OpenRouterResponse;

    // Transform the response into a map for easier lookup
    const modelMap: Record<string, OpenRouterModelData> = {};

    if (responseData.data && Array.isArray(responseData.data)) {
      responseData.data.forEach(model => {
        // Store by original ID
        modelMap[model.id] = model;

        // Also store by normalized name for fuzzy matching
        if (model.name) {
          modelMap[normalizeModelName(model.name)] = model;
        }

        // Store by normalized ID
        modelMap[normalizeModelName(model.id)] = model;
      });
    }

    openRouterModelCache = modelMap;
    lastFetchTime = now;

    return modelMap;
  } catch (error) {
    // Log error quietly without throwing
    console.warn('Error fetching OpenRouter models:', error);

    // Return empty object if fetch fails
    return {};
  }
};

/**
 * Hook to check if a model is new
 */
export const useNewModelCheck = (modelName: string, provider?: string) => {
  const [isNew, setIsNew] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [createdAt, setCreatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!modelName) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const checkIfModelIsNew = async () => {
      try {
        // Use preloaded data if available, otherwise fetch
        const openRouterModels = openRouterModelCache || await initOpenRouterData();

        // If we have no data, don't show NEW badge
        if (!openRouterModels || Object.keys(openRouterModels).length === 0) {
          if (isMounted) {
            setIsNew(false);
            setCreatedAt(null);
            setIsLoading(false);
          }
          return;
        }

        const oneWeekAgo = Date.now() - NEW_MODEL_DAYS_THRESHOLD * 24 * 60 * 60 * 1000; // Models newer than threshold

        // Normalize the input model name
        const normalizedModelName = normalizeModelName(modelName);

        // Try exact match first
        const exactMatch = openRouterModels[modelName];
        if (exactMatch && exactMatch.created) {
          if (isMounted) {
            setIsNew(exactMatch.created * 1000 > oneWeekAgo);
            setCreatedAt(exactMatch.created);
            setIsLoading(false);
          }
          return;
        }

        // Try normalized match
        const normalizedMatch = openRouterModels[normalizedModelName];
        if (normalizedMatch && normalizedMatch.created) {
          if (isMounted) {
            setIsNew(normalizedMatch.created * 1000 > oneWeekAgo);
            setCreatedAt(normalizedMatch.created);
            setIsLoading(false);
          }
          return;
        }

        // If we have provider information, try to use it for better matching
        if (provider) {
          const providerLower = provider.toLowerCase();

          // Look for matches that include both the provider and model name
          for (const key in openRouterModels) {
            const model = openRouterModels[key];
            const modelId = normalizeModelName(model.id);
            const modelName = model.name ? normalizeModelName(model.name) : '';

            // Check if the model ID or name contains both the provider and normalized model name
            // Or if the model's developer matches the provider
            const developerMatch = model.developer &&
              normalizeModelName(model.developer).includes(normalizeModelName(providerLower));

            const nameMatch = (modelId.includes(normalizedModelName) ||
                              (modelName && modelName.includes(normalizedModelName))) &&
                              (modelId.includes(normalizeModelName(providerLower)) ||
                               modelName.includes(normalizeModelName(providerLower)));

            if ((nameMatch || developerMatch) && model.created * 1000 > oneWeekAgo) {
              if (isMounted) {
                setIsNew(true);
                setCreatedAt(model.created);
                setIsLoading(false);
              }
              return;
            }
          }
        }

        // If no match found with provider, fall back to fuzzy matching
        let isModelNew = false;
        let matchCreatedAt: number | null = null;

        for (const key in openRouterModels) {
          if (normalizedModelName.includes(normalizeModelName(key)) ||
              normalizeModelName(key).includes(normalizedModelName)) {
            if (openRouterModels[key].created * 1000 > oneWeekAgo) {
              isModelNew = true;
              matchCreatedAt = openRouterModels[key].created;
              break;
            }
          }
        }

        if (isMounted) {
          setIsNew(isModelNew);
          setCreatedAt(matchCreatedAt);
          setIsLoading(false);
        }
      } catch (err) {
        // Don't show error to users, just log it silently and don't show NEW badge
        console.warn('Error checking if model is new:', err);
        if (isMounted) {
          setIsNew(false); // Don't show NEW badge on error
          setCreatedAt(null);
          setIsLoading(false);
        }
      }
    };

    checkIfModelIsNew();

    return () => {
      isMounted = false;
    };
  }, [modelName, provider]);

  return { isNew, isLoading, createdAt };
};

/**
 * Initialize OpenRouter models data once at the application level
 * Returns a promise that resolves when data is loaded
 */
export const initOpenRouterData = async (): Promise<Record<string, OpenRouterModelData>> => {
  if (!openRouterDataPromise) {
    openRouterDataPromise = fetchOpenRouterModels()
      .then(data => {
        openRouterModelCache = data;
        return data;
      })
      .catch(err => {
        // Silently handle errors and return empty data
        console.warn('Failed to initialize OpenRouter data:', err);
        return {};
      });
  }
  return openRouterDataPromise;
};
