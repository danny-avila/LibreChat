import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const MODEL = process.env.IMAGE_EDIT_MODEL || 'qwen-image-edit-max';

if (!DASHSCOPE_API_KEY) {
  console.error('Error: DASHSCOPE_API_KEY environment variable is required');
  process.exit(1);
}

const server = new Server(
  {
    name: 'image-edit',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'edit_image',
        description: 'Edit or modify an existing image using Qwen Image Edit model. Provide the image URL and describe the changes.',
        inputSchema: {
          type: 'object',
          properties: {
            image_url: {
              type: 'string',
              description: 'URL of the image to edit.',
            },
            prompt: {
              type: 'string',
              description: 'Description of the edits to make.',
            },
            size: {
              type: 'string',
              description: 'Output image size. Default: 1024*1024',
              enum: ['1024*1024', '720*1280', '1280*720', '2048*2048'],
              default: '1024*1024',
            },
          },
          required: ['image_url', 'prompt'],
        },
      },
    ],
  };
});

async function callDashScopeAPI(prompt, negativePrompt, size, imageUrl) {
  const messages = [];

  if (imageUrl) {
    messages.push({
      role: 'user',
      content: [
        { image: imageUrl },
        { text: prompt },
      ],
    });
  }

  const requestBody = {
    model: MODEL,
    input: {
      messages: messages,
    },
    parameters: {
      size: size || '1024*1024',
      prompt_extend: true,
      watermark: false,
    },
  };

  if (negativePrompt) {
    requestBody.parameters.negative_prompt = negativePrompt;
  }

  const response = await fetch(DASHSCOPE_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DashScope API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  if (result.output && result.output.choices && result.output.choices[0]) {
    const content = result.output.choices[0].message.content;
    if (content && content[0] && content[0].image) {
      return content[0].image;
    }
  }

  throw new Error('No image returned from DashScope API');
}

async function downloadImageAsBase64(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = response.headers.get('content-type') || 'image/png';
  return { base64, contentType };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'edit_image') {
      const { image_url, prompt, size } = args;

      if (!image_url || !prompt) {
        return {
          content: [{ type: 'text', text: 'Error: image_url and prompt are required' }],
          isError: true,
        };
      }

      const imageUrl = await callDashScopeAPI(prompt, null, size, image_url);
      const { base64, contentType } = await downloadImageAsBase64(imageUrl);

      return {
        content: [
          {
            type: 'image',
            data: base64,
            mimeType: contentType,
          },
          {
            type: 'text',
            text: `Image edited successfully. Prompt: "${prompt}"`,
          },
        ],
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Image Edit MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
