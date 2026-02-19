import {
  WebSearchToolDefinition,
  CalculatorToolDefinition,
  CodeExecutionToolDefinition,
} from '@librechat/agents';

/** Extended JSON Schema type that includes standard validation keywords */
export type ExtendedJsonSchema = {
  type?: 'string' | 'number' | 'integer' | 'float' | 'boolean' | 'array' | 'object' | 'null';
  enum?: (string | number | boolean | null)[];
  items?: ExtendedJsonSchema;
  properties?: Record<string, ExtendedJsonSchema>;
  required?: string[];
  description?: string;
  additionalProperties?: boolean | ExtendedJsonSchema;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  format?: string;
  default?: unknown;
  const?: unknown;
  oneOf?: ExtendedJsonSchema[];
  anyOf?: ExtendedJsonSchema[];
  allOf?: ExtendedJsonSchema[];
  $ref?: string;
  $defs?: Record<string, ExtendedJsonSchema>;
  definitions?: Record<string, ExtendedJsonSchema>;
};

export interface ToolRegistryDefinition {
  name: string;
  description: string;
  schema: ExtendedJsonSchema;
  description_for_model?: string;
  responseFormat?: 'content_and_artifact' | 'content';
  toolType: 'builtin' | 'mcp' | 'action' | 'custom';
}

/** Google Search tool JSON schema */
export const googleSearchSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'The search query string.',
    },
    max_results: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      description: 'The maximum number of search results to return. Defaults to 5.',
    },
  },
  required: ['query'],
};

/** DALL-E 3 tool JSON schema */
export const dalle3Schema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      maxLength: 4000,
      description:
        'A text description of the desired image, following the rules, up to 4000 characters.',
    },
    style: {
      type: 'string',
      enum: ['vivid', 'natural'],
      description:
        'Must be one of `vivid` or `natural`. `vivid` generates hyper-real and dramatic images, `natural` produces more natural, less hyper-real looking images',
    },
    quality: {
      type: 'string',
      enum: ['hd', 'standard'],
      description: 'The quality of the generated image. Only `hd` and `standard` are supported.',
    },
    size: {
      type: 'string',
      enum: ['1024x1024', '1792x1024', '1024x1792'],
      description:
        'The size of the requested image. Use 1024x1024 (square) as the default, 1792x1024 if the user requests a wide image, and 1024x1792 for full-body portraits. Always include this parameter in the request.',
    },
  },
  required: ['prompt', 'style', 'quality', 'size'],
};

/** Flux API tool JSON schema */
export const fluxApiSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['generate', 'list_finetunes', 'generate_finetuned'],
      description:
        'Action to perform: "generate" for image generation, "generate_finetuned" for finetuned model generation, "list_finetunes" to get available custom models',
    },
    prompt: {
      type: 'string',
      description:
        'Text prompt for image generation. Required when action is "generate". Not used for list_finetunes.',
    },
    width: {
      type: 'number',
      description:
        'Width of the generated image in pixels. Must be a multiple of 32. Default is 1024.',
    },
    height: {
      type: 'number',
      description:
        'Height of the generated image in pixels. Must be a multiple of 32. Default is 768.',
    },
    prompt_upsampling: {
      type: 'boolean',
      description: 'Whether to perform upsampling on the prompt.',
    },
    steps: {
      type: 'integer',
      description: 'Number of steps to run the model for, a number from 1 to 50. Default is 40.',
    },
    seed: {
      type: 'number',
      description: 'Optional seed for reproducibility.',
    },
    safety_tolerance: {
      type: 'number',
      description:
        'Tolerance level for input and output moderation. Between 0 and 6, 0 being most strict, 6 being least strict.',
    },
    endpoint: {
      type: 'string',
      enum: [
        '/v1/flux-pro-1.1',
        '/v1/flux-pro',
        '/v1/flux-dev',
        '/v1/flux-pro-1.1-ultra',
        '/v1/flux-pro-finetuned',
        '/v1/flux-pro-1.1-ultra-finetuned',
      ],
      description: 'Endpoint to use for image generation.',
    },
    raw: {
      type: 'boolean',
      description:
        'Generate less processed, more natural-looking images. Only works for /v1/flux-pro-1.1-ultra.',
    },
    finetune_id: {
      type: 'string',
      description: 'ID of the finetuned model to use',
    },
    finetune_strength: {
      type: 'number',
      description: 'Strength of the finetuning effect (typically between 0.1 and 1.2)',
    },
    guidance: {
      type: 'number',
      description: 'Guidance scale for finetuned models',
    },
    aspect_ratio: {
      type: 'string',
      description: 'Aspect ratio for ultra models (e.g., "16:9")',
    },
  },
  required: [],
};

/** OpenWeather tool JSON schema */
export const openWeatherSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['help', 'current_forecast', 'timestamp', 'daily_aggregation', 'overview'],
      description: 'The action to perform',
    },
    city: {
      type: 'string',
      description: 'City name for geocoding if lat/lon not provided',
    },
    lat: {
      type: 'number',
      description: 'Latitude coordinate',
    },
    lon: {
      type: 'number',
      description: 'Longitude coordinate',
    },
    exclude: {
      type: 'string',
      description: 'Parts to exclude from the response',
    },
    units: {
      type: 'string',
      enum: ['Celsius', 'Kelvin', 'Fahrenheit'],
      description: 'Temperature units',
    },
    lang: {
      type: 'string',
      description: 'Language code',
    },
    date: {
      type: 'string',
      description: 'Date in YYYY-MM-DD format for timestamp and daily_aggregation',
    },
    tz: {
      type: 'string',
      description: 'Timezone',
    },
  },
  required: ['action'],
};

/** Wolfram Alpha tool JSON schema */
export const wolframSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    input: {
      type: 'string',
      description: 'Natural language query to WolframAlpha following the guidelines',
    },
  },
  required: ['input'],
};

/** Stable Diffusion tool JSON schema */
export const stableDiffusionSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description:
        'Detailed keywords to describe the subject, using at least 7 keywords to accurately describe the image, separated by comma',
    },
    negative_prompt: {
      type: 'string',
      description:
        'Keywords we want to exclude from the final image, using at least 7 keywords to accurately describe the image, separated by comma',
    },
  },
  required: ['prompt', 'negative_prompt'],
};

/** Azure AI Search tool JSON schema */
export const azureAISearchSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Search word or phrase to Azure AI Search',
    },
  },
  required: ['query'],
};

/** Traversaal Search tool JSON schema */
export const traversaalSearchSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        "A properly written sentence to be interpreted by an AI to search the web according to the user's request.",
    },
  },
  required: ['query'],
};

/** Tavily Search Results tool JSON schema */
export const tavilySearchSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'The search query string.',
    },
    max_results: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      description: 'The maximum number of search results to return. Defaults to 5.',
    },
    search_depth: {
      type: 'string',
      enum: ['basic', 'advanced'],
      description:
        'The depth of the search, affecting result quality and response time (`basic` or `advanced`). Default is basic for quick results and advanced for indepth high quality results but longer response time. Advanced calls equals 2 requests.',
    },
    include_images: {
      type: 'boolean',
      description:
        'Whether to include a list of query-related images in the response. Default is False.',
    },
    include_answer: {
      type: 'boolean',
      description: 'Whether to include answers in the search results. Default is False.',
    },
    include_raw_content: {
      type: 'boolean',
      description: 'Whether to include raw content in the search results. Default is False.',
    },
    include_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'A list of domains to specifically include in the search results.',
    },
    exclude_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'A list of domains to specifically exclude from the search results.',
    },
    topic: {
      type: 'string',
      enum: ['general', 'news', 'finance'],
      description:
        'The category of the search. Use news ONLY if query SPECIFCALLY mentions the word "news".',
    },
    time_range: {
      type: 'string',
      enum: ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'],
      description: 'The time range back from the current date to filter results.',
    },
    days: {
      type: 'number',
      minimum: 1,
      description: 'Number of days back from the current date to include. Only if topic is news.',
    },
    include_image_descriptions: {
      type: 'boolean',
      description:
        'When include_images is true, also add a descriptive text for each image. Default is false.',
    },
  },
  required: ['query'],
};

/** File Search tool JSON schema */
export const fileSearchSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        "A natural language query to search for relevant information in the files. Be specific and use keywords related to the information you're looking for. The query will be used for semantic similarity matching against the file contents.",
    },
  },
  required: ['query'],
};

/** OpenAI Image Generation tool JSON schema */
export const imageGenOaiSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      maxLength: 32000,
      description: `Describe the image you want in detail. 
      Be highly specific—break your idea into layers: 
      (1) main concept and subject,
      (2) composition and position,
      (3) lighting and mood,
      (4) style, medium, or camera details,
      (5) important features (age, expression, clothing, etc.),
      (6) background.
      Use positive, descriptive language and specify what should be included, not what to avoid. 
      List number and characteristics of people/objects, and mention style/technical requirements (e.g., "DSLR photo, 85mm lens, golden hour").
      Do not reference any uploaded images—use for new image creation from text only.`,
    },
    background: {
      type: 'string',
      enum: ['transparent', 'opaque', 'auto'],
      description:
        'Sets transparency for the background. Must be one of transparent, opaque or auto (default). When transparent, the output format should be png or webp.',
    },
    quality: {
      type: 'string',
      enum: ['auto', 'high', 'medium', 'low'],
      description: 'The quality of the image. One of auto (default), high, medium, or low.',
    },
    size: {
      type: 'string',
      enum: ['auto', '1024x1024', '1536x1024', '1024x1536'],
      description:
        'The size of the generated image. One of 1024x1024, 1536x1024 (landscape), 1024x1536 (portrait), or auto (default).',
    },
  },
  required: ['prompt'],
};

/** OpenAI Image Edit tool JSON schema */
export const imageEditOaiSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    image_ids: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: `IDs (image ID strings) of previously generated or uploaded images that should guide the edit.

Guidelines:
- If the user's request depends on any prior image(s), copy their image IDs into the \`image_ids\` array (in the same order the user refers to them).  
- Never invent or hallucinate IDs; only use IDs that are still visible in the conversation context.
- If no earlier image is relevant, omit the field entirely.`,
    },
    prompt: {
      type: 'string',
      maxLength: 32000,
      description: `Describe the changes, enhancements, or new ideas to apply to the uploaded image(s).
      Be highly specific—break your request into layers: 
      (1) main concept or transformation,
      (2) specific edits/replacements or composition guidance,
      (3) desired style, mood, or technique,
      (4) features/items to keep, change, or add (such as objects, people, clothing, lighting, etc.).
      Use positive, descriptive language and clarify what should be included or changed, not what to avoid.
      Always base this prompt on the most recently uploaded reference images.`,
    },
    quality: {
      type: 'string',
      enum: ['auto', 'high', 'medium', 'low'],
      description:
        'The quality of the image. One of auto (default), high, medium, or low. High/medium/low only supported for gpt-image-1.',
    },
    size: {
      type: 'string',
      enum: ['auto', '1024x1024', '1536x1024', '1024x1536', '256x256', '512x512'],
      description:
        'The size of the generated images. For gpt-image-1: auto (default), 1024x1024, 1536x1024, 1024x1536. For dall-e-2: 256x256, 512x512, 1024x1024.',
    },
  },
  required: ['image_ids', 'prompt'],
};

/** Gemini Image Generation tool JSON schema */
export const geminiImageGenSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      maxLength: 32000,
      description:
        'A detailed text description of the desired image, up to 32000 characters. For "editing" requests, describe the changes you want to make to the referenced image. Be specific about composition, style, lighting, and subject matter.',
    },
    image_ids: {
      type: 'array',
      items: { type: 'string' },
      description: `Optional array of image IDs to use as visual context for generation.

Guidelines:
- For "editing" requests: ALWAYS include the image ID being "edited"
- For new generation with context: Include any relevant reference image IDs
- If the user's request references any prior images, include their image IDs in this array
- These images will be used as visual context/inspiration for the new generation
- Never invent or hallucinate IDs; only use IDs that are visible in the conversation
- If no images are relevant, omit this field entirely`,
    },
    aspectRatio: {
      type: 'string',
      enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      description:
        'The aspect ratio of the generated image. Use 16:9 or 3:2 for landscape, 9:16 or 2:3 for portrait, 21:9 for ultra-wide/cinematic, 1:1 for square. Defaults to 1:1 if not specified.',
    },
    imageSize: {
      type: 'string',
      enum: ['1K', '2K', '4K'],
      description:
        'The resolution of the generated image. Use 1K for standard, 2K for high, 4K for maximum quality. Defaults to 1K if not specified.',
    },
  },
  required: ['prompt'],
};

/** Tool definitions registry - maps tool names to their definitions */
export const toolDefinitions: Record<string, ToolRegistryDefinition> = {
  google: {
    name: 'google',
    description:
      'A search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events.',
    schema: googleSearchSchema,
    toolType: 'builtin',
  },
  dalle: {
    name: 'dalle',
    description: `Use DALLE to create images from text descriptions.
    - It requires prompts to be in English, detailed, and to specify image type and human features for diversity.
    - Create only one image, without repeating or listing descriptions outside the "prompts" field.
    - Maintains the original intent of the description, with parameters for image style, quality, and size to tailor the output.`,
    schema: dalle3Schema,
    toolType: 'builtin',
  },
  flux: {
    name: 'flux',
    description:
      'Use Flux to generate images from text descriptions. This tool can generate images and list available finetunes. Each generate call creates one image. For multiple images, make multiple consecutive calls.',
    schema: fluxApiSchema,
    toolType: 'builtin',
  },
  open_weather: {
    name: 'open_weather',
    description:
      'Provides weather data from OpenWeather One Call API 3.0. Actions: help, current_forecast, timestamp, daily_aggregation, overview. If lat/lon not provided, specify "city" for geocoding. Units: "Celsius", "Kelvin", or "Fahrenheit" (default: Celsius). For timestamp action, use "date" in YYYY-MM-DD format.',
    schema: openWeatherSchema,
    toolType: 'builtin',
  },
  wolfram: {
    name: 'wolfram',
    description:
      'WolframAlpha offers computation, math, curated knowledge, and real-time data. It handles natural language queries and performs complex calculations. Follow the guidelines to get the best results.',
    schema: wolframSchema,
    toolType: 'builtin',
  },
  'stable-diffusion': {
    name: 'stable-diffusion',
    description:
      "You can generate images using text with 'stable-diffusion'. This tool is exclusively for visual content.",
    schema: stableDiffusionSchema,
    toolType: 'builtin',
  },
  'azure-ai-search': {
    name: 'azure-ai-search',
    description: "Use the 'azure-ai-search' tool to retrieve search results relevant to your input",
    schema: azureAISearchSchema,
    toolType: 'builtin',
  },
  traversaal_search: {
    name: 'traversaal_search',
    description:
      'An AI search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events. Input should be a search query.',
    schema: traversaalSearchSchema,
    toolType: 'builtin',
  },
  tavily_search_results_json: {
    name: 'tavily_search_results_json',
    description:
      'A search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events.',
    schema: tavilySearchSchema,
    toolType: 'builtin',
  },
  file_search: {
    name: 'file_search',
    description:
      'Performs semantic search across attached "file_search" documents using natural language queries. This tool analyzes the content of uploaded files to find relevant information, quotes, and passages that best match your query.',
    schema: fileSearchSchema,
    toolType: 'builtin',
    responseFormat: 'content_and_artifact',
  },
  image_gen_oai: {
    name: 'image_gen_oai',
    description: `Generates high-quality, original images based solely on text, not using any uploaded reference images.

When to use \`image_gen_oai\`:
- To create entirely new images from detailed text descriptions that do NOT reference any image files.

When NOT to use \`image_gen_oai\`:
- If the user has uploaded any images and requests modifications, enhancements, or remixing based on those uploads → use \`image_edit_oai\` instead.

Generated image IDs will be returned in the response, so you can refer to them in future requests made to \`image_edit_oai\`.`,
    schema: imageGenOaiSchema,
    toolType: 'builtin',
    responseFormat: 'content_and_artifact',
  },
  image_edit_oai: {
    name: 'image_edit_oai',
    description: `Generates high-quality, original images based on text and one or more uploaded/referenced images.

When to use \`image_edit_oai\`:
- The user wants to modify, extend, or remix one **or more** uploaded images, either:
- Previously generated, or in the current request (both to be included in the \`image_ids\` array).
- Always when the user refers to uploaded images for editing, enhancement, remixing, style transfer, or combining elements.
- Any current or existing images are to be used as visual guides.
- If there are any files in the current request, they are more likely than not expected as references for image edit requests.

When NOT to use \`image_edit_oai\`:
- Brand-new generations that do not rely on an existing image → use \`image_gen_oai\` instead.

Both generated and referenced image IDs will be returned in the response, so you can refer to them in future requests made to \`image_edit_oai\`.`,
    schema: imageEditOaiSchema,
    toolType: 'builtin',
    responseFormat: 'content_and_artifact',
  },
  gemini_image_gen: {
    name: 'gemini_image_gen',
    description: `Generates high-quality, original images based on text prompts, with optional image context.

When to use \`gemini_image_gen\`:
- To create entirely new images from detailed text descriptions
- To generate images using existing images as context or inspiration
- When the user requests image generation, creation, or asks to "generate an image"
- When the user asks to "edit", "modify", "change", or "swap" elements in an image (generates new image with changes)

When NOT to use \`gemini_image_gen\`:
- For uploading or saving existing images without modification

Generated image IDs will be returned in the response, so you can refer to them in future requests.`,
    schema: geminiImageGenSchema,
    toolType: 'builtin',
    responseFormat: 'content_and_artifact',
  },
};

/** Tool definitions from @librechat/agents */
const agentToolDefinitions: Record<string, ToolRegistryDefinition> = {
  [CalculatorToolDefinition.name]: {
    name: CalculatorToolDefinition.name,
    description: CalculatorToolDefinition.description,
    schema: CalculatorToolDefinition.schema as unknown as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  [CodeExecutionToolDefinition.name]: {
    name: CodeExecutionToolDefinition.name,
    description: CodeExecutionToolDefinition.description,
    schema: CodeExecutionToolDefinition.schema as unknown as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  [WebSearchToolDefinition.name]: {
    name: WebSearchToolDefinition.name,
    description: WebSearchToolDefinition.description,
    schema: WebSearchToolDefinition.schema as unknown as ExtendedJsonSchema,
    toolType: 'builtin',
  },
};

export function getToolDefinition(toolName: string): ToolRegistryDefinition | undefined {
  return toolDefinitions[toolName] ?? agentToolDefinitions[toolName];
}

export function getAllToolDefinitions(): ToolRegistryDefinition[] {
  return [...Object.values(toolDefinitions), ...Object.values(agentToolDefinitions)];
}

export function getToolSchema(toolName: string): ExtendedJsonSchema | undefined {
  return getToolDefinition(toolName)?.schema;
}
