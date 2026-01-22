const { logger } = require('@librechat/data-schemas');

/**
 * Extracts token probability from API response logprobs
 * @param {Object} responseData - The response data from the API (LangChain AIMessage or raw API response)
 * @returns {number | null} - The token probability as a percentage (0-100), or null if not available
 */
function extractTokenProbability(responseData) {
  try {
    // Handle LangChain serialized format - data might be in kwargs
    let actualData = responseData;
    if (responseData?.kwargs) {
      actualData = responseData.kwargs;
      logger.info('[extractTokenProbability] Found LangChain kwargs structure, extracting from kwargs');
    }

    logger.info('[extractTokenProbability] Response data structure:', {
      hasResponseMetadata: !!actualData?.response_metadata,
      hasAdditionalKwargs: !!actualData?.additional_kwargs,
      responseMetadataKeys: actualData?.response_metadata ? Object.keys(actualData.response_metadata) : [],
      additionalKwargsKeys: actualData?.additional_kwargs ? Object.keys(actualData.additional_kwargs) : [],
      allKeys: Object.keys(actualData || {}),
      hasKwargs: !!responseData?.kwargs,
    });
    
    // Log the actual response_metadata and additional_kwargs content
    if (actualData?.response_metadata) {
      try {
        const metadataStr = JSON.stringify(actualData.response_metadata, null, 2);
        console.log('[extractTokenProbability] response_metadata content:', metadataStr.substring(0, 2000));
        logger.info('[extractTokenProbability] response_metadata keys:', Object.keys(actualData.response_metadata));
      } catch (e) {
        logger.warn('[extractTokenProbability] Could not stringify response_metadata:', e);
        console.log('[extractTokenProbability] response_metadata (direct):', actualData.response_metadata);
      }
    }
    if (actualData?.additional_kwargs) {
      try {
        const kwargsStr = JSON.stringify(actualData.additional_kwargs, null, 2);
        console.log('[extractTokenProbability] additional_kwargs content:', kwargsStr.substring(0, 2000));
        logger.info('[extractTokenProbability] additional_kwargs keys:', Object.keys(actualData.additional_kwargs));
      } catch (e) {
        logger.warn('[extractTokenProbability] Could not stringify additional_kwargs:', e);
        console.log('[extractTokenProbability] additional_kwargs (direct):', actualData.additional_kwargs);
      }
    }

    // Check for logprobs in various locations based on provider and LangChain structure
    let logprobs = null;

    // OpenAI format: response_metadata.logprobs or additional_kwargs.response_metadata.logprobs
    if (actualData?.response_metadata?.logprobs) {
      logprobs = actualData.response_metadata.logprobs;
      logger.info('[extractTokenProbability] Found logprobs in response_metadata.logprobs');
    } else if (actualData?.additional_kwargs?.response_metadata?.logprobs) {
      logprobs = actualData.additional_kwargs.response_metadata.logprobs;
      logger.info('[extractTokenProbability] Found logprobs in additional_kwargs.response_metadata.logprobs');
    } else if (actualData?.additional_kwargs?.logprobs) {
      logprobs = actualData.additional_kwargs.logprobs;
      logger.info('[extractTokenProbability] Found logprobs in additional_kwargs.logprobs');
    }

    // Also check for raw response structure (from OpenAI SDK directly)
    // OpenAI format: choices[0].logprobs.content[0].logprob
    if (!logprobs && actualData?.response_metadata?.raw_response) {
      const rawResponse = actualData.response_metadata.raw_response;
      logger.info('[extractTokenProbability] Checking raw_response:', {
        hasChoices: !!rawResponse?.choices,
        choicesLength: rawResponse?.choices?.length,
        firstChoiceKeys: rawResponse?.choices?.[0] ? Object.keys(rawResponse.choices[0]) : [],
        hasLogprobs: !!rawResponse?.choices?.[0]?.logprobs,
        logprobsKeys: rawResponse?.choices?.[0]?.logprobs ? Object.keys(rawResponse.choices[0].logprobs) : [],
        hasContent: !!rawResponse?.choices?.[0]?.logprobs?.content,
        contentLength: rawResponse?.choices?.[0]?.logprobs?.content?.length,
      });
      
      // OpenAI format: choices[0].logprobs.content is an array of token objects
      if (rawResponse?.choices?.[0]?.logprobs?.content) {
        const content = rawResponse.choices[0].logprobs.content;
        if (Array.isArray(content) && content.length > 0) {
          // Get the first token's logprob
          const firstToken = content[0];
          if (firstToken?.logprob != null) {
            // Convert log probability to percentage (0-100)
            const prob = Math.exp(firstToken.logprob);
            const percentage = Math.round(prob * 100);
            logger.info('[extractTokenProbability] Found logprob in raw_response, extracted percentage:', {
              logprob: firstToken.logprob,
              probability: prob,
              percentage,
            });
            return percentage;
          }
        }
      }
      
      // Fallback: check if logprobs object exists
      if (rawResponse?.choices?.[0]?.logprobs) {
        logprobs = rawResponse.choices[0].logprobs;
        logger.info('[extractTokenProbability] Found logprobs object in raw_response.choices[0].logprobs');
      }
    }

    // Check for LangChain streaming response format
    if (!logprobs && actualData?.response_metadata?.raw_response?.logprobs) {
      logprobs = actualData.response_metadata.raw_response.logprobs;
      logger.info('[extractTokenProbability] Found logprobs in raw_response.logprobs');
    }

    // Check in the original responseData structure as well (for non-kwargs format)
    if (!logprobs) {
      if (responseData?.response_metadata?.logprobs) {
        logprobs = responseData.response_metadata.logprobs;
        logger.info('[extractTokenProbability] Found logprobs in responseData.response_metadata.logprobs');
      } else if (responseData?.additional_kwargs?.response_metadata?.logprobs) {
        logprobs = responseData.additional_kwargs.response_metadata.logprobs;
        logger.info('[extractTokenProbability] Found logprobs in responseData.additional_kwargs.response_metadata.logprobs');
      }
      
      // Also check raw_response in original structure
      if (!logprobs && responseData?.response_metadata?.raw_response?.choices?.[0]?.logprobs?.content) {
        const content = responseData.response_metadata.raw_response.choices[0].logprobs.content;
        if (Array.isArray(content) && content.length > 0) {
          const firstToken = content[0];
          if (firstToken?.logprob != null) {
            const prob = Math.exp(firstToken.logprob);
            const percentage = Math.round(prob * 100);
            logger.info('[extractTokenProbability] Found logprob in responseData.response_metadata.raw_response, extracted:', percentage);
            return percentage;
          }
        }
      }
    }

    if (!logprobs) {
      // Check if this is a Google Gemini response (they may not support logprobs in streaming)
      const isGoogleGemini = actualData?.additional_kwargs?.['__gemini_function_call_thought_signatures__'] !== undefined;
      if (isGoogleGemini) {
        logger.info('[extractTokenProbability] Google Gemini detected - logprobs may not be supported in streaming mode');
      }
      logger.warn('[extractTokenProbability] No logprobs found in response', {
        responseMetadata: actualData?.response_metadata,
        additionalKwargs: actualData?.additional_kwargs,
        isGoogleGemini,
        note: 'Google Gemini may not return logprobs in streaming mode. Try OpenAI models for logprobs support.',
      });
      return null;
    }

    logger.info('[extractTokenProbability] Found logprobs object:', {
      logprobsType: typeof logprobs,
      logprobsKeys: typeof logprobs === 'object' && logprobs !== null ? Object.keys(logprobs) : [],
      hasContent: Array.isArray(logprobs.content),
      contentLength: Array.isArray(logprobs.content) ? logprobs.content.length : 0,
      firstTokenSample: Array.isArray(logprobs.content) && logprobs.content.length > 0 ? {
        token: logprobs.content[0].token,
        hasLogprob: logprobs.content[0].logprob != null,
        logprob: logprobs.content[0].logprob,
      } : null,
    });

    // Extract token probability from logprobs
    // OpenAI format: logprobs.content[0].logprob (for first token)
    // logprobs.content is an array of token objects with { token, logprob, bytes, top_logprobs? }
    if (Array.isArray(logprobs.content) && logprobs.content.length > 0) {
      // Get the first token's logprob (the response token)
      const firstToken = logprobs.content[0];
      if (firstToken?.logprob != null && typeof firstToken.logprob === 'number') {
        // Convert log probability to probability (0-1), then to percentage (0-100)
        // logprob is log(p), so p = exp(logprob)
        const prob = Math.exp(firstToken.logprob);
        const percentage = Math.round(prob * 100);
        logger.info('[extractTokenProbability] Extracted token probability from logprobs.content:', {
          token: firstToken.token,
          logprob: firstToken.logprob,
          probability: prob,
          percentage,
        });
        return percentage;
      }
    }

    // Check for token_logprobs array (alternative OpenAI format)
    if (Array.isArray(logprobs.token_logprobs) && logprobs.token_logprobs.length > 0) {
      const firstLogprob = logprobs.token_logprobs[0];
      if (firstLogprob != null && typeof firstLogprob === 'number') {
        const prob = Math.exp(firstLogprob);
        const percentage = Math.round(prob * 100);
        if (process.env.NODE_ENV === 'development') {
          logger.debug('[extractTokenProbability] Extracted from token_logprobs:', percentage);
        }
        return percentage;
      }
    }

    // Google format: might be different structure
    // Check for top_logprobs or similar
    if (logprobs.top_logprobs && Array.isArray(logprobs.top_logprobs) && logprobs.top_logprobs.length > 0) {
      const topLogprob = logprobs.top_logprobs[0];
      if (topLogprob?.logprob != null) {
        const prob = Math.exp(topLogprob.logprob);
        return Math.round(prob * 100);
      }
    }

    // Fallback: if logprobs is a direct number (already a probability)
    if (typeof logprobs === 'number') {
      // If it's already a probability (0-1), convert to percentage
      if (logprobs <= 1) {
        return Math.round(logprobs * 100);
      }
      // If it's already a percentage (0-100), return as is
      return Math.round(logprobs);
    }

    return null;
  } catch (error) {
    logger.debug('[extractTokenProbability] Error extracting token probability:', error);
    return null;
  }
}

module.exports = {
  extractTokenProbability,
};
