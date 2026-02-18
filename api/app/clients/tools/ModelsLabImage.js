const { StructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');
const axios = require('axios');
const { logger } = require('~/config');

/**
 * ModelsLab Image Generation Tool for LibreChat
 * 
 * Provides access to 13+ AI image generation models through ModelsLab API:
 * - Flux (latest SOTA model)
 * - Stable Diffusion XL (SDXL) 
 * - Playground v2.5
 * - Stable Diffusion
 * - And many more...
 * 
 * Features:
 * - Multi-model support in single tool
 * - Competitive pricing ($0.008-0.018 per image)
 * - High-quality image generation
 * - Async processing with progress tracking
 * - Comprehensive parameter control
 */
class ModelsLabImageTool extends StructuredTool {
  constructor(fields) {
    super();
    
    this.name = 'modelslab_image_generation';
    this.description = `Generate high-quality images using ModelsLab's cutting-edge AI models including Flux, SDXL, Playground v2.5, and Stable Diffusion. Perfect for creating professional artwork, UI mockups, product visualizations, and creative content. Supports detailed prompting, negative prompts, and extensive customization options.`;
    
    // API configuration
    this.apiKey = fields?.MODELSLAB_API_KEY || process.env.MODELSLAB_API_KEY;
    this.baseUrl = 'https://modelslab.com/api/v6';
    
    // Available models with their characteristics
    this.availableModels = {
      'flux': {
        name: 'Flux',
        description: 'Latest SOTA model for professional, highly detailed images',
        cost: 0.018,
        max_resolution: '1536x1536'
      },
      'sdxl': {
        name: 'Stable Diffusion XL',
        description: 'Excellent for artistic and creative content',
        cost: 0.015,
        max_resolution: '1280x1280'
      },
      'playground-v2': {
        name: 'Playground v2.5',
        description: 'Optimized for UI mockups and clean, aesthetic designs',
        cost: 0.012,
        max_resolution: '1024x1024'
      },
      'stable-diffusion': {
        name: 'Stable Diffusion',
        description: 'Fast and reliable for general purpose image generation',
        cost: 0.008,
        max_resolution: '1024x1024'
      }
    };

    this.schema = z.object({
      prompt: z.string().min(3).max(1000).describe(
        'Detailed description of the image to generate. Be descriptive and specific about style, composition, colors, and visual elements desired.'
      ),
      model: z.enum(['flux', 'sdxl', 'playground-v2', 'stable-diffusion']).optional().default('flux').describe(
        'AI model to use for generation. Options: flux (highest quality, $0.018), sdxl (artistic, $0.015), playground-v2 (UI/design, $0.012), stable-diffusion (fast/cheap, $0.008)'
      ),
      negative_prompt: z.string().optional().describe(
        'Elements to exclude or avoid in the generated image (e.g., "blur, low quality, distorted, watermark")'
      ),
      width: z.number().int().min(256).max(1536).optional().default(1024).describe(
        'Image width in pixels (256-1536). Common sizes: 512, 768, 1024, 1280, 1536'
      ),
      height: z.number().int().min(256).max(1536).optional().default(1024).describe(
        'Image height in pixels (256-1536). Common sizes: 512, 768, 1024, 1280, 1536'
      ),
      steps: z.number().int().min(10).max(50).optional().default(25).describe(
        'Number of denoising steps. More steps = higher quality but slower generation (10-50, recommended: 20-30)'
      ),
      guidance_scale: z.number().min(1).max(20).optional().default(7.5).describe(
        'How closely to follow the prompt. Higher values follow prompt more strictly (1-20, recommended: 5-12)'
      ),
      enhance_prompt: z.boolean().optional().default(true).describe(
        'Automatically enhance the prompt with quality modifiers for better results'
      ),
      safety_checker: z.boolean().optional().default(true).describe(
        'Enable content filtering to ensure appropriate image generation'
      )
    });
  }

  /**
   * Validate API key availability
   */
  _validateApiKey() {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error(
        'ModelsLab API key is required. Please set MODELSLAB_API_KEY environment variable or provide it in tool configuration. Get your API key from: https://modelslab.com/dashboard/api-keys'
      );
    }
  }

  /**
   * Enhance prompt with quality modifiers if enabled
   */
  _enhancePrompt(prompt, enhance = true) {
    if (!enhance) return prompt;
    
    // Check if prompt already has quality terms
    const qualityTerms = [
      'high quality', 'detailed', 'sharp', 'crisp', 'clear',
      'professional', 'masterpiece', 'best quality', 'ultra detailed',
      '8k', '4k', 'hd', 'uhd'
    ];
    
    const hasQuality = qualityTerms.some(term => 
      prompt.toLowerCase().includes(term.toLowerCase())
    );
    
    // Add quality enhancement for substantial prompts without existing quality terms
    if (!hasQuality && prompt.length > 10) {
      return `${prompt}, high quality, detailed, professional`;
    }
    
    return prompt;
  }

  /**
   * Map model names to ModelsLab API model IDs
   */
  _getModelId(model) {
    const modelMapping = {
      'flux': 'flux',
      'sdxl': 'sdxl',
      'playground-v2': 'playground-v2-5',
      'stable-diffusion': 'stable-diffusion-v1-6'
    };
    
    return modelMapping[model] || 'flux';
  }

  /**
   * Create HTTP client with proper configuration
   */
  _createHttpClient() {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // 60 seconds
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LibreChat-ModelsLab/1.0.0'
      }
    });
  }

  /**
   * Make generation request to ModelsLab API
   */
  async _generateImage(params) {
    const client = this._createHttpClient();
    const modelId = this._getModelId(params.model);
    
    const payload = {
      key: this.apiKey,
      model_id: modelId,
      prompt: params.prompt,
      negative_prompt: params.negative_prompt || '',
      width: params.width,
      height: params.height,
      samples: 1,
      num_inference_steps: params.steps,
      guidance_scale: params.guidance_scale,
      enhance_prompt: params.enhance_prompt,
      safety_checker: params.safety_checker,
      seed: null,
      webhook: null,
      track_id: null
    };

    logger.debug('[ModelsLabImageTool] Generating image with payload:', {
      model: modelId,
      prompt: params.prompt.substring(0, 100) + '...',
      dimensions: `${params.width}x${params.height}`,
      steps: params.steps,
      guidance: params.guidance_scale
    });

    try {
      const response = await client.post('/images/text2img', payload);
      return response.data;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || error.response.statusText;
        
        if (status === 401) {
          throw new Error(`Invalid ModelsLab API key. Please check your MODELSLAB_API_KEY. Get a valid key from: https://modelslab.com/dashboard/api-keys`);
        } else if (status === 402) {
          throw new Error(`Insufficient credits in your ModelsLab account. Please add credits at: https://modelslab.com/dashboard/billing`);
        } else if (status === 400) {
          throw new Error(`Invalid request parameters: ${message}. Please check your prompt and parameters.`);
        } else {
          throw new Error(`ModelsLab API error (${status}): ${message}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout. The image generation took too long. Please try again or use fewer steps.');
      } else {
        throw new Error(`Network error connecting to ModelsLab API: ${error.message}`);
      }
    }
  }

  /**
   * Poll for image generation completion
   */
  async _pollForCompletion(requestId, maxAttempts = 30) {
    const client = this._createHttpClient();
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        const response = await client.post('/images/fetch', {
          key: this.apiKey,
          request_id: requestId
        });

        const data = response.data;
        
        if (data.status === 'success') {
          return data;
        } else if (data.status === 'error') {
          throw new Error(`Generation failed: ${data.message || 'Unknown error occurred'}`);
        } else if (data.status === 'processing') {
          logger.debug(`[ModelsLabImageTool] Generation in progress... (attempt ${attempts + 1}/${maxAttempts})`);
          attempts++;
          continue;
        } else {
          throw new Error(`Unexpected status: ${data.status}`);
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new Error('Generation request not found. The request may have expired or been cancelled.');
        }
        throw error;
      }
    }
    
    throw new Error(`Generation timed out after ${maxAttempts * 2} seconds. The request may still be processing.`);
  }

  /**
   * Main tool execution method
   */
  async _call(params) {
    try {
      // Validate API key
      this._validateApiKey();

      // Enhance prompt if requested
      const enhancedPrompt = this._enhancePrompt(params.prompt, params.enhance_prompt);
      const finalParams = { ...params, prompt: enhancedPrompt };

      // Get model info for cost calculation
      const modelInfo = this.availableModels[params.model];
      const estimatedCost = modelInfo.cost;

      logger.info(`[ModelsLabImageTool] Starting image generation with ${modelInfo.name} model (estimated cost: $${estimatedCost})`);

      // Make generation request
      const response = await this._generateImage(finalParams);

      let imageUrl;
      
      if (response.status === 'success') {
        // Immediate success
        if (response.output && response.output.length > 0) {
          imageUrl = response.output[0];
        } else {
          throw new Error('No image URL returned from ModelsLab API');
        }
      } else if (response.status === 'processing') {
        // Async processing - need to poll
        logger.info(`[ModelsLabImageTool] Image generation queued (ID: ${response.id}). Polling for completion...`);
        
        const completedResponse = await this._pollForCompletion(response.id);
        
        if (completedResponse.output && completedResponse.output.length > 0) {
          imageUrl = completedResponse.output[0];
        } else {
          throw new Error('No image URL returned after processing completion');
        }
      } else {
        throw new Error(`Unexpected response status: ${response.status}. Message: ${response.message || 'Unknown error'}`);
      }

      // Success response
      const successMessage = [
        `✅ **Image Generated Successfully**`,
        ``,
        `**Model**: ${modelInfo.name} (${params.model})`,
        `**Prompt**: ${finalParams.prompt}`,
        params.negative_prompt ? `**Negative Prompt**: ${params.negative_prompt}` : null,
        `**Dimensions**: ${params.width} × ${params.height}`,
        `**Steps**: ${params.steps}`,
        `**Guidance Scale**: ${params.guidance_scale}`,
        `**Estimated Cost**: $${estimatedCost.toFixed(3)}`,
        ``,
        `**Image URL**: ${imageUrl}`,
        ``,
        `The high-quality image has been generated and is ready for use. The image URL can be used to display, download, or further process the generated image.`
      ].filter(Boolean).join('\n');

      logger.info(`[ModelsLabImageTool] Image generation completed successfully. URL: ${imageUrl}`);
      
      return successMessage;

    } catch (error) {
      const errorMessage = `❌ **Image Generation Failed**\n\n**Error**: ${error.message}\n\n**Troubleshooting**:\n- Verify your ModelsLab API key is valid\n- Check your account has sufficient credits\n- Ensure prompt follows content guidelines\n- Try reducing image dimensions or steps if timeout occurred\n\n**Get Help**: https://docs.modelslab.com or support@modelslab.com`;
      
      logger.error(`[ModelsLabImageTool] Generation failed:`, error.message);
      
      return errorMessage;
    }
  }
}

module.exports = ModelsLabImageTool;