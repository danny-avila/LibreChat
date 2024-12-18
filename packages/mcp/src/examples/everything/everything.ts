import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CreateMessageRequest,
  CreateMessageResultSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Resource,
  SetLevelRequestSchema,
  SubscribeRequestSchema,
  Tool,
  ToolSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

/* Input schemas for tools implemented in this server */
const EchoSchema = z.object({
  message: z.string().describe('Message to echo'),
});

const AddSchema = z.object({
  a: z.number().describe('First number'),
  b: z.number().describe('Second number'),
});

const LongRunningOperationSchema = z.object({
  duration: z.number().default(10).describe('Duration of the operation in seconds'),
  steps: z.number().default(5).describe('Number of steps in the operation'),
});

const SampleLLMSchema = z.object({
  prompt: z.string().describe('The prompt to send to the LLM'),
  maxTokens: z.number().default(100).describe('Maximum number of tokens to generate'),
});

const GetTinyImageSchema = z.object({});

enum ToolName {
  ECHO = 'echo',
  ADD = 'add',
  LONG_RUNNING_OPERATION = 'longRunningOperation',
  SAMPLE_LLM = 'sampleLLM',
  GET_TINY_IMAGE = 'getTinyImage',
}

enum PromptName {
  SIMPLE = 'simple_prompt',
  COMPLEX = 'complex_prompt',
}

export const createServer = () => {
  const server = new Server(
    {
      name: 'example-servers/everything',
      version: '1.0.0',
    },
    {
      capabilities: {
        prompts: {},
        resources: { subscribe: true },
        tools: {},
        logging: {},
      },
    },
  );

  const subscriptions: Set<string> = new Set();
  let updateInterval: NodeJS.Timeout | undefined;

  // Set up update interval for subscribed resources
  // eslint-disable-next-line prefer-const
  updateInterval = setInterval(() => {
    // @ts-ignore
    for (const uri of subscriptions) {
      server.notification({
        method: 'notifications/resources/updated',
        params: { uri },
      });
    }
  }, 5000);

  // Helper method to request sampling from client
  const requestSampling = async (context: string, uri: string, maxTokens = 100) => {
    const request: CreateMessageRequest = {
      method: 'sampling/createMessage',
      params: {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Resource ${uri} context: ${context}`,
            },
          },
        ],
        systemPrompt: 'You are a helpful test server.',
        maxTokens,
        temperature: 0.7,
        includeContext: 'thisServer',
      },
    };

    return await server.request(request, CreateMessageResultSchema);
  };

  const ALL_RESOURCES: Resource[] = Array.from({ length: 100 }, (_, i) => {
    const uri = `test://static/resource/${i + 1}`;
    if (i % 2 === 0) {
      return {
        uri,
        name: `Resource ${i + 1}`,
        mimeType: 'text/plain',
        text: `Resource ${i + 1}: This is a plaintext resource`,
      };
    } else {
      const buffer = Buffer.from(`Resource ${i + 1}: This is a base64 blob`);
      return {
        uri,
        name: `Resource ${i + 1}`,
        mimeType: 'application/octet-stream',
        blob: buffer.toString('base64'),
      };
    }
  });

  const PAGE_SIZE = 10;

  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const cursor = request.params?.cursor;
    let startIndex = 0;

    if (cursor) {
      const decodedCursor = parseInt(atob(cursor), 10);
      if (!isNaN(decodedCursor)) {
        startIndex = decodedCursor;
      }
    }

    const endIndex = Math.min(startIndex + PAGE_SIZE, ALL_RESOURCES.length);
    const resources = ALL_RESOURCES.slice(startIndex, endIndex);

    let nextCursor: string | undefined;
    if (endIndex < ALL_RESOURCES.length) {
      nextCursor = btoa(endIndex.toString());
    }

    return {
      resources,
      nextCursor,
    };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: [
        {
          uriTemplate: 'test://static/resource/{id}',
          name: 'Static Resource',
          description: 'A static resource with a numeric ID',
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri.startsWith('test://static/resource/')) {
      const index = parseInt(uri.split('/').pop() ?? '', 10) - 1;
      if (index >= 0 && index < ALL_RESOURCES.length) {
        const resource = ALL_RESOURCES[index];
        return {
          contents: [resource],
        };
      }
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    const { uri } = request.params;
    subscriptions.add(uri);

    // Request sampling from client when someone subscribes
    await requestSampling('A new subscription was started', uri);
    return {};
  });

  server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    subscriptions.delete(request.params.uri);
    return {};
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: PromptName.SIMPLE,
          description: 'A prompt without arguments',
        },
        {
          name: PromptName.COMPLEX,
          description: 'A prompt with arguments',
          arguments: [
            {
              name: 'temperature',
              description: 'Temperature setting',
              required: true,
            },
            {
              name: 'style',
              description: 'Output style',
              required: false,
            },
          ],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === PromptName.SIMPLE) {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'This is a simple prompt without arguments.',
            },
          },
        ],
      };
    }

    if (name === PromptName.COMPLEX) {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `This is a complex prompt with arguments: temperature=${args?.temperature}, style=${args?.style}`,
            },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: 'I understand. You\'ve provided a complex prompt with temperature and style arguments. How would you like me to proceed?',
            },
          },
          {
            role: 'user',
            content: {
              type: 'image',
              data: MCP_TINY_IMAGE,
              mimeType: 'image/png',
            },
          },
        ],
      };
    }

    throw new Error(`Unknown prompt: ${name}`);
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [
      {
        name: ToolName.ECHO,
        description: 'Echoes back the input',
        inputSchema: zodToJsonSchema(EchoSchema) as ToolInput,
      },
      {
        name: ToolName.ADD,
        description: 'Adds two numbers',
        inputSchema: zodToJsonSchema(AddSchema) as ToolInput,
      },
      {
        name: ToolName.LONG_RUNNING_OPERATION,
        description: 'Demonstrates a long running operation with progress updates',
        inputSchema: zodToJsonSchema(LongRunningOperationSchema) as ToolInput,
      },
      {
        name: ToolName.SAMPLE_LLM,
        description: 'Samples from an LLM using MCP\'s sampling feature',
        inputSchema: zodToJsonSchema(SampleLLMSchema) as ToolInput,
      },
      {
        name: ToolName.GET_TINY_IMAGE,
        description: 'Returns the MCP_TINY_IMAGE',
        inputSchema: zodToJsonSchema(GetTinyImageSchema) as ToolInput,
      },
    ];

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === ToolName.ECHO) {
      const validatedArgs = EchoSchema.parse(args);
      return {
        content: [{ type: 'text', text: `Echo: ${validatedArgs.message}` }],
      };
    }

    if (name === ToolName.ADD) {
      const validatedArgs = AddSchema.parse(args);
      const sum = validatedArgs.a + validatedArgs.b;
      return {
        content: [
          {
            type: 'text',
            text: `The sum of ${validatedArgs.a} and ${validatedArgs.b} is ${sum}.`,
          },
        ],
      };
    }

    if (name === ToolName.LONG_RUNNING_OPERATION) {
      const validatedArgs = LongRunningOperationSchema.parse(args);
      const { duration, steps } = validatedArgs;
      const stepDuration = duration / steps;
      const progressToken = request.params._meta?.progressToken;

      for (let i = 1; i < steps + 1; i++) {
        await new Promise((resolve) => setTimeout(resolve, stepDuration * 1000));

        if (progressToken !== undefined) {
          await server.notification({
            method: 'notifications/progress',
            params: {
              progress: i,
              total: steps,
              progressToken,
            },
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Long running operation completed. Duration: ${duration} seconds, Steps: ${steps}.`,
          },
        ],
      };
    }

    if (name === ToolName.SAMPLE_LLM) {
      const validatedArgs = SampleLLMSchema.parse(args);
      const { prompt, maxTokens } = validatedArgs;

      const result = await requestSampling(prompt, ToolName.SAMPLE_LLM, maxTokens);
      return {
        content: [{ type: 'text', text: `LLM sampling result: ${result}` }],
      };
    }

    if (name === ToolName.GET_TINY_IMAGE) {
      GetTinyImageSchema.parse(args);
      return {
        content: [
          {
            type: 'text',
            text: 'This is a tiny image:',
          },
          {
            type: 'image',
            data: MCP_TINY_IMAGE,
            mimeType: 'image/png',
          },
          {
            type: 'text',
            text: 'The image above is the MCP tiny image.',
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  server.setRequestHandler(SetLevelRequestSchema, async (request) => {
    const { level } = request.params;

    // Demonstrate different log levels
    await server.notification({
      method: 'notifications/message',
      params: {
        level: 'debug',
        logger: 'test-server',
        data: `Logging level set to: ${level}`,
      },
    });

    return {};
  });

  const cleanup = async () => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  };

  return { server, cleanup };
};

const MCP_TINY_IMAGE =
  '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';
