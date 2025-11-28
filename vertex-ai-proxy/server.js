import express from 'express';
import { initAuth, getAccessToken, getProjectId } from './lib/auth.js';
import { parseSSEStream, formatSSE } from './lib/streaming.js';
import { processMessages } from './lib/media.js';

const app = express();
app.use(express.json({ limit: '50mb' }));

// Configuration
const PORT = process.env.VERTEX_PROXY_PORT || 4001;
const LOCATION = process.env.VERTEX_LOCATION || 'us-east5';
const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || '../librechat-vertex-claude-key.json';

let PROJECT_ID = process.env.GCP_PROJECT_ID;

// Model mapping: friendly name -> Vertex AI model ID
const MODEL_MAP = {
  // Claude 4.x models
  'claude-sonnet-4-5': 'claude-sonnet-4-5@20250929',
  'claude-sonnet-4': 'claude-sonnet-4@20250514',
  'claude-opus-4': 'claude-opus-4@20250514',
  'claude-opus-4-5': 'claude-opus-4-5@20251101',
  'claude-opus-4-1': 'claude-opus-4-1@20250805',
  'claude-haiku-4-5': 'claude-haiku-4-5@20251001',
  
  // Claude 3.x models
  'claude-3-7-sonnet': 'claude-3-7-sonnet@20250219',
  'claude-3-5-sonnet-v2': 'claude-3-5-sonnet-v2@20241022',
  'claude-3-5-sonnet': 'claude-3-5-sonnet@20240620',
  'claude-3-5-haiku': 'claude-3-5-haiku@20241022',
  'claude-3-opus': 'claude-3-opus@20240229',
  'claude-3-haiku': 'claude-3-haiku@20240307',
  
  // Allow direct model IDs
  'claude-sonnet-4-5@20250929': 'claude-sonnet-4-5@20250929',
  'claude-sonnet-4@20250514': 'claude-sonnet-4@20250514',
  'claude-opus-4@20250514': 'claude-opus-4@20250514',
  'claude-opus-4-5@20251101': 'claude-opus-4-5@20251101',
  'claude-opus-4-1@20250805': 'claude-opus-4-1@20250805',
  'claude-haiku-4-5@20251001': 'claude-haiku-4-5@20251001',
  'claude-3-7-sonnet@20250219': 'claude-3-7-sonnet@20250219',
  'claude-3-5-sonnet-v2@20241022': 'claude-3-5-sonnet-v2@20241022',
  'claude-3-5-haiku@20241022': 'claude-3-5-haiku@20241022'
};

/**
 * Get Vertex AI model ID from request model name
 */
function getVertexModelId(model) {
  // Check if it's in our map
  if (MODEL_MAP[model]) {
    return MODEL_MAP[model];
  }
  
  // If it already has @ version suffix, use as-is
  if (model.includes('@')) {
    return model;
  }
  
  // Default: append a generic version (may need updating)
  console.warn(`[Proxy] Unknown model: ${model}, using as-is`);
  return model;
}

/**
 * Build Vertex AI endpoint URL
 */
function getVertexEndpoint(model, stream = false) {
  const vertexModel = getVertexModelId(model);
  const action = stream ? 'streamRawPredict' : 'rawPredict';
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/anthropic/models/${vertexModel}:${action}`;
}

/**
 * Generate a unique message ID
 */
function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'vertex-ai-proxy',
    project: PROJECT_ID,
    location: LOCATION
  });
});

// List models endpoint
app.get('/v1/models', (req, res) => {
  const models = Object.keys(MODEL_MAP)
    .filter(m => !m.includes('@')) // Only friendly names
    .map(id => ({
      id,
      object: 'model',
      created: Date.now(),
      owned_by: 'anthropic',
      vertex_id: MODEL_MAP[id]
    }));
  
  res.json({
    object: 'list',
    data: models
  });
});

// Main messages endpoint (Anthropic-compatible)
app.post('/v1/messages', async (req, res) => {
  try {
    const {
      model,
      messages,
      max_tokens = 4096,
      temperature,
      top_p,
      top_k,
      stop_sequences,
      stream = false,
      system,
      metadata,
      tools,
      tool_choice
    } = req.body;

    console.log(`[Proxy] Request: model=${model}, stream=${stream}, messages=${messages.length}`);

    // Get access token
    const accessToken = await getAccessToken();

    // Process messages for images/files
    const processedMessages = processMessages(messages);

    // Build Vertex AI request body
    const vertexBody = {
      anthropic_version: 'vertex-2023-10-16',
      messages: processedMessages,
      max_tokens
    };

    // Add optional parameters
    if (system) vertexBody.system = system;
    if (temperature !== undefined) vertexBody.temperature = temperature;
    if (top_p !== undefined) vertexBody.top_p = top_p;
    if (top_k !== undefined) vertexBody.top_k = top_k;
    if (stop_sequences) vertexBody.stop_sequences = stop_sequences;
    if (metadata) vertexBody.metadata = metadata;
    if (tools) vertexBody.tools = tools;
    if (tool_choice) vertexBody.tool_choice = tool_choice;

    // Always use streaming for Vertex AI
    vertexBody.stream = stream;

    const endpoint = getVertexEndpoint(model, stream);
    console.log(`[Proxy] Calling: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(vertexBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] Vertex AI error: ${response.status} ${errorText}`);
      return res.status(response.status).json({
        error: {
          type: 'api_error',
          message: `Vertex AI error: ${response.status}`,
          details: errorText
        }
      });
    }

    if (stream) {
      // Streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const messageId = generateMessageId();
      let contentBlockStarted = false;
      let blockIndex = 0;

      await parseSSEStream(response.body, (event) => {
        const data = event.data;
        
        if (!data || typeof data !== 'object') return;

        // Forward Anthropic events directly
        if (data.type) {
          res.write(formatSSE(data.type, data));
          
          // Track content block state
          if (data.type === 'content_block_start') {
            contentBlockStarted = true;
            blockIndex = data.index || 0;
          }
        }
      });

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('[Proxy] Error:', error);
    res.status(500).json({
      error: {
        type: 'internal_error',
        message: error.message
      }
    });
  }
});

// Also support /messages without /v1 prefix
app.post('/messages', (req, res, next) => {
  req.url = '/v1/messages';
  next();
});

/**
 * Convert OpenAI chat format to Anthropic messages format
 */
function convertOpenAIToAnthropic(openaiMessages) {
  let systemMessage = null;
  const messages = [];

  for (const msg of openaiMessages) {
    if (msg.role === 'system') {
      systemMessage = typeof msg.content === 'string' 
        ? msg.content 
        : msg.content.map(c => c.text || '').join('\n');
    } else {
      // Convert content format
      let content;
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text };
          } else if (part.type === 'image_url') {
            // Convert OpenAI image format to Anthropic format
            const url = part.image_url?.url || part.image_url;
            if (url.startsWith('data:')) {
              const matches = url.match(/^data:([^;]+);base64,(.+)$/);
              if (matches) {
                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: matches[1],
                    data: matches[2]
                  }
                };
              }
            }
            return { type: 'text', text: `[Image: ${url}]` };
          }
          return part;
        });
      } else {
        content = msg.content;
      }

      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content
      });
    }
  }

  return { systemMessage, messages };
}

/**
 * Convert Anthropic response to OpenAI format
 */
function convertAnthropicToOpenAI(anthropicResponse, model) {
  const content = anthropicResponse.content?.[0]?.text || '';
  
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content
      },
      finish_reason: anthropicResponse.stop_reason === 'end_turn' ? 'stop' : anthropicResponse.stop_reason
    }],
    usage: {
      prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
      completion_tokens: anthropicResponse.usage?.output_tokens || 0,
      total_tokens: (anthropicResponse.usage?.input_tokens || 0) + (anthropicResponse.usage?.output_tokens || 0)
    }
  };
}

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const {
      model,
      messages: openaiMessages,
      max_tokens,
      temperature,
      top_p,
      stop,
      stream = false,
      tools,
      tool_choice
    } = req.body;

    console.log(`[Proxy] OpenAI-compat request: model=${model}, stream=${stream}, messages=${openaiMessages?.length}`);

    // Convert OpenAI format to Anthropic format
    const { systemMessage, messages } = convertOpenAIToAnthropic(openaiMessages || []);

    // Get access token
    const accessToken = await getAccessToken();

    // Process messages for images/files
    const processedMessages = processMessages(messages);

    // Build Vertex AI request body
    const vertexBody = {
      anthropic_version: 'vertex-2023-10-16',
      messages: processedMessages,
      max_tokens: max_tokens || 4096
    };

    // Add optional parameters
    if (systemMessage) vertexBody.system = systemMessage;
    if (temperature !== undefined) vertexBody.temperature = temperature;
    if (top_p !== undefined) vertexBody.top_p = top_p;
    if (stop) vertexBody.stop_sequences = Array.isArray(stop) ? stop : [stop];
    if (tools) vertexBody.tools = tools;
    if (tool_choice) vertexBody.tool_choice = tool_choice;

    vertexBody.stream = stream;

    const endpoint = getVertexEndpoint(model, stream);
    console.log(`[Proxy] Calling: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(vertexBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] Vertex AI error: ${response.status} ${errorText}`);
      return res.status(response.status).json({
        error: {
          message: `Vertex AI error: ${response.status}`,
          type: 'api_error',
          code: response.status
        }
      });
    }

    if (stream) {
      // Streaming response in OpenAI format
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const chatId = `chatcmpl-${Date.now()}`;
      
      // Send initial chunk
      res.write(`data: ${JSON.stringify({
        id: chatId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null
        }]
      })}\n\n`);

      await parseSSEStream(response.body, (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        // Convert Anthropic streaming events to OpenAI format
        if (data.type === 'content_block_delta' && data.delta?.text) {
          res.write(`data: ${JSON.stringify({
            id: chatId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
              index: 0,
              delta: { content: data.delta.text },
              finish_reason: null
            }]
          })}\n\n`);
        } else if (data.type === 'message_stop' || data.type === 'message_delta') {
          res.write(`data: ${JSON.stringify({
            id: chatId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: 'stop'
            }]
          })}\n\n`);
        }
      });

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      const anthropicData = await response.json();
      const openaiResponse = convertAnthropicToOpenAI(anthropicData, model);
      res.json(openaiResponse);
    }
  } catch (error) {
    console.error('[Proxy] Error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'internal_error'
      }
    });
  }
});

// Also support /chat/completions without /v1 prefix
app.post('/chat/completions', (req, res, next) => {
  req.url = '/v1/chat/completions';
  next();
});

// Initialize and start server
async function start() {
  try {
    // Get project ID from key file if not set
    if (!PROJECT_ID) {
      PROJECT_ID = getProjectId(KEY_FILE);
    }
    
    console.log(`[Proxy] Initializing with project: ${PROJECT_ID}`);
    console.log(`[Proxy] Location: ${LOCATION}`);
    console.log(`[Proxy] Key file: ${KEY_FILE}`);
    
    await initAuth(KEY_FILE);
    
    app.listen(PORT, () => {
      console.log(`[Proxy] Vertex AI Claude proxy running on port ${PORT}`);
      console.log(`[Proxy] Endpoints:`);
      console.log(`  - POST /v1/chat/completions (OpenAI-compatible)`);
      console.log(`  - POST /v1/messages (Anthropic-compatible)`);
      console.log(`  - GET  /v1/models`);
      console.log(`  - GET  /health`);
    });
  } catch (error) {
    console.error('[Proxy] Failed to start:', error);
    process.exit(1);
  }
}

start();
