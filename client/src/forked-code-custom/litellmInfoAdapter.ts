import { useState, useEffect } from 'react';

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

// Cache mechanism
let modelInfoCache: Record<string, LiteLLMModelInfo> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // Cache for 1 hour

/**
 * Fetch model information from our secure server-side proxy
 * and transform it into a more usable format for the model badges
 */
export const fetchModelInfo = async (): Promise<Record<string, LiteLLMModelInfo>> => {
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
 * Hook to get model information
 */
export const useModelInfo = (modelName: string) => {
  const [modelInfo, setModelInfo] = useState<LiteLLMModelInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!modelName) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const getModelInfo = async () => {
      try {
        const data = await fetchModelInfo();
        // Find the exact model info
        const info = data[modelName];
        if (isMounted) {
          setModelInfo(info || null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error fetching model info:', err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          setIsLoading(false);
        }
      }
    };

    getModelInfo();

    return () => {
      isMounted = false;
    };
  }, [modelName]);

  return { modelInfo, isLoading, error };
};

// Export a singleton instance for global model info
export const getModelInfo = async (modelName: string): Promise<LiteLLMModelInfo | null> => {
  try {
    const data = await fetchModelInfo();
    return data[modelName] || null;
  } catch (error) {
    console.error('Error getting model info:', error);
    return null;
  }
};

export default {
  fetchModelInfo,
  useModelInfo,
  getModelInfo,
};