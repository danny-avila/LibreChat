import { useState, useEffect, useMemo } from 'react';
import type { TModelSpec } from 'librechat-data-provider';

// Type definitions for LiteLLM API response
export interface LiteLLMResponse {
  data: LiteLLMModelData[];
}

export interface LiteLLMModelData {
  model_name: string;
  litellm_params: {
    custom_llm_provider?: string;
    model: string;
    litellm_credential_name?: string;
    use_in_pass_through: boolean;
    merge_reasoning_content_in_choices: boolean;
    thinking?: {
      type: string;
      budget_tokens: number;
    };
    reasoning_effort?: string;
    // Other params omitted for brevity
  };
  model_info: LiteLLMModelInfo;
}

// Model information properties
export interface LiteLLMModelInfo {
  id?: string;
  db_model?: boolean;
  key?: string;
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  input_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  input_cost_per_character?: number | null;
  input_cost_per_token_above_128k_tokens?: number | null;
  input_cost_per_query?: number | null;
  input_cost_per_second?: number | null;
  input_cost_per_audio_token?: number | null;
  input_cost_per_token_batches?: number | null;
  output_cost_per_token_batches?: number | null;
  output_cost_per_token?: number;
  output_cost_per_audio_token?: number | null;
  output_cost_per_character?: number | null;
  output_cost_per_token_above_128k_tokens?: number | null;
  output_cost_per_character_above_128k_tokens?: number | null;
  output_cost_per_second?: number | null;
  output_cost_per_image?: number | null;
  output_vector_size?: number | null;
  litellm_provider?: string;
  mode?: string;
  supports_system_messages?: boolean | null;
  supports_response_schema?: boolean;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_tool_choice?: boolean;
  supports_assistant_prefill?: boolean;
  supports_prompt_caching?: boolean;
  supports_audio_input?: boolean;
  supports_audio_output?: boolean;
  supports_pdf_input?: boolean;
  supports_embedding_image_input?: boolean;
  supports_native_streaming?: boolean | null;
  supports_web_search?: boolean;
  supports_parallel_function_calling?: boolean;
  search_context_cost_per_query?: {
    search_context_size_low?: number;
    search_context_size_medium?: number;
    search_context_size_high?: number;
  } | null;
  tpm?: number | null;
  rpm?: number | null;
  supported_openai_params?: string[];
}

/**
 * Model pricing and capability information returned by our hooks
 */
export interface ModelPricingInfo {
  inputPrice: number | null;
  outputPrice: number | null;
  showPricing: boolean;
  isFree: boolean;
  maxTokens: number | null;
  disabled: boolean;
}

// Cache mechanism
let modelInfoCache: Record<string, LiteLLMModelInfo> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // Cache for 1 hour

// Singleton promise for initialization
let globalLiteLLMDataPromise: Promise<Record<string, LiteLLMModelInfo>> | null = null;

/**
 * Fetch model information from our secure server-side proxy
 * and transform it into a more usable format for the model badges
 */
export const fetchLiteLLMModelInfo = async (): Promise<Record<string, LiteLLMModelInfo>> => {
  const now = Date.now();

  // Use cached data if available and fresh
  if (modelInfoCache && now - lastFetchTime < CACHE_DURATION) {
    return modelInfoCache;
  }

  try {
    // Use our secure server-side proxy
    const response = await fetch('/api/forked/litellm/model-info');

    if (!response.ok) {
      throw new Error(`Failed to fetch model info: ${response.status}`);
    }

    const responseData = await response.json() as LiteLLMResponse;

    // Transform the response into a map of model_name -> model_info
    const modelInfoMap: Record<string, LiteLLMModelInfo> = {};

    if (responseData.data && Array.isArray(responseData.data)) {
      responseData.data.forEach(modelData => {
        if (modelData.model_name && modelData.model_info) {
          modelInfoMap[modelData.model_name] = modelData.model_info;

          // Also map by the actual model name from litellm_params for better matching
          if (modelData.litellm_params && modelData.litellm_params.model) {
            modelInfoMap[modelData.litellm_params.model] = modelData.model_info;
          }
        }
      });
    }

    modelInfoCache = modelInfoMap;
    lastFetchTime = now;

    return modelInfoMap;
  } catch (error) {
    console.error('Error fetching model info:', error);
    // Return empty object if fetch fails
    return {};
  }
};

/**
 * Initialize LiteLLM model data once at the application level
 * Returns a promise that resolves when data is loaded
 */
export const initLiteLLMModelData = async (): Promise<Record<string, LiteLLMModelInfo>> => {
  if (!globalLiteLLMDataPromise) {
    globalLiteLLMDataPromise = fetchLiteLLMModelInfo().then(data => {
      modelInfoCache = data;
      return data;
    }).catch(err => {
      console.warn('Failed to initialize LiteLLM model data:', err);
      return {};
    });
  }
  return globalLiteLLMDataPromise;
};

/**
 * Hook to get model pricing and capability information
 * Uses badges configuration or falls back to LiteLLM data
 */
export const useModelPricingInfo = (spec: TModelSpec): ModelPricingInfo => {
  const [pricingInfo, setPricingInfo] = useState<ModelPricingInfo>({
    inputPrice: null,
    outputPrice: null,
    showPricing: true,
    isFree: false,
    maxTokens: null,
    disabled: false,
  });

  // If spec is invalid or empty, return default values
  const modelName = spec?.preset?.model || '';

  useEffect(() => {
    // If spec is invalid, return early
    if (!spec || !spec?.name) {
      return;
    }

    let isMounted = true;

    const getPricingInfo = async () => {
      // Initialize with default values
      let infoData: ModelPricingInfo = {
        inputPrice: null,
        outputPrice: null,
        showPricing: true,
        isFree: false,
        maxTokens: null,
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

        infoData = {
          ...infoData,
          inputPrice: inputPrice ?? infoData.inputPrice,
          outputPrice: outputPrice ?? infoData.outputPrice,
          showPricing,
          isFree,
          maxTokens: maxContextToken ?? infoData.maxTokens,
          disabled,
        };
      }

      // If we have missing data and model name is provided, try to get from LiteLLM
      const needsMoreData = !infoData.disabled &&
        modelName &&
        (infoData.maxTokens === null || infoData.inputPrice === null || infoData.outputPrice === null);

      if (needsMoreData) {
        try {
          // Get LiteLLM data (this will use the already initialized cache from ForkedCustomizations)
          const modelData = await fetchLiteLLMModelInfo();

          // Directly look up the model by name without complex matching
          const modelInfo = modelData[modelName];

          if (modelInfo && isMounted) {
            // Only override values that weren't explicitly set in the badges config
            if (infoData.inputPrice === null && modelInfo.input_cost_per_token !== undefined) {
              infoData.inputPrice = modelInfo.input_cost_per_token * 1000000;
            }

            if (infoData.outputPrice === null && modelInfo.output_cost_per_token !== undefined) {
              infoData.outputPrice = modelInfo.output_cost_per_token * 1000000;
            }

            // Get max tokens if not already specified
            if (infoData.maxTokens === null) {
              // Try max_input_tokens first, then max_tokens as fallback
              infoData.maxTokens = modelInfo.max_input_tokens || modelInfo.max_tokens || null;
            }

            // Check if both input and output costs are 0 (free model)
            // Only update isFree if it wasn't explicitly set
            if (!spec.badges?.isFree &&
                modelInfo.input_cost_per_token === 0 &&
                modelInfo.output_cost_per_token === 0) {
              infoData.isFree = true;
            }
          }
        } catch (error) {
          console.error('Error fetching model pricing info:', error);
        }
      }

      if (isMounted) {
        setPricingInfo(infoData);
      }
    };

    getPricingInfo();
    return () => { isMounted = false; };
  }, [spec, modelName]);

  // Memoize the returned object to prevent unnecessary re-renders
  return useMemo(() => pricingInfo, [pricingInfo]);
};