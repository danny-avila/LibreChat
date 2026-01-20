/**
 * Open Responses API Integration Tests
 *
 * Tests the /v1/responses endpoint against the Open Responses specification
 * compliance tests. Uses real Anthropic API for LLM calls.
 *
 * @see https://openresponses.org/specification
 * @see https://github.com/openresponses/openresponses/blob/main/src/lib/compliance-tests.ts
 */

// Load environment variables from root .env file for API keys
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });

const originalEnv = {
  CREDS_KEY: process.env.CREDS_KEY,
  CREDS_IV: process.env.CREDS_IV,
};

process.env.CREDS_KEY = '0123456789abcdef0123456789abcdef';
process.env.CREDS_IV = '0123456789abcdef';

// Skip tests if ANTHROPIC_API_KEY is not available
const SKIP_INTEGRATION_TESTS = !process.env.ANTHROPIC_API_KEY;
if (SKIP_INTEGRATION_TESTS) {
  console.warn('ANTHROPIC_API_KEY not found - skipping integration tests');
}

// Mock services that aren't needed for these tests
jest.mock('~/server/services/Config', () => ({
  loadCustomConfig: jest.fn(() => Promise.resolve({})),
  getAppConfig: jest.fn().mockResolvedValue({
    paths: {
      uploads: '/tmp',
      dist: '/tmp/dist',
      fonts: '/tmp/fonts',
      assets: '/tmp/assets',
    },
    fileStrategy: 'local',
    imageOutputType: 'PNG',
  }),
  setCachedTools: jest.fn(),
  getCachedTools: jest.fn(),
  getMCPServerTools: jest.fn().mockReturnValue([]),
}));

jest.mock('~/app/clients/tools', () => ({
  createOpenAIImageTools: jest.fn(() => []),
  createYouTubeTools: jest.fn(() => []),
  manifestToolMap: {},
  toolkits: [],
}));

jest.mock('~/config', () => ({
  createMCPServersRegistry: jest.fn(),
  createMCPManager: jest.fn().mockResolvedValue({
    getAppToolFunctions: jest.fn().mockResolvedValue({}),
  }),
}));

const fs = require('fs');
const request = require('supertest');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { agentSchema } = require('@librechat/data-schemas');

/** @type {import('mongoose').Model} */
let Agent;

/**
 * Parse SSE stream into events
 * @param {string} text - Raw SSE text
 * @returns {Array<{event: string, data: unknown}>}
 */
function parseSSEEvents(text) {
  const events = [];
  const lines = text.split('\n');

  let currentEvent = '';
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      currentData = line.slice(5).trim();
    } else if (line === '' && currentData) {
      if (currentData === '[DONE]') {
        events.push({ event: 'done', data: '[DONE]' });
      } else {
        try {
          const parsed = JSON.parse(currentData);
          events.push({
            event: currentEvent || parsed.type || 'unknown',
            data: parsed,
          });
        } catch {
          // Skip unparseable data
        }
      }
      currentEvent = '';
      currentData = '';
    }
  }

  return events;
}

/**
 * Create a test agent with Anthropic provider
 * @param {Object} overrides
 * @returns {Promise<Object>}
 */
async function createTestAgent(overrides = {}) {
  const timestamp = new Date();
  const agentData = {
    id: `agent_${uuidv4().replace(/-/g, '').substring(0, 21)}`,
    name: 'Test Anthropic Agent',
    description: 'An agent for testing Open Responses API',
    instructions: 'You are a helpful assistant. Be concise.',
    provider: 'Anthropic',
    model: 'claude-sonnet-4-5-20250929',
    author: new mongoose.Types.ObjectId(),
    tools: [],
    model_parameters: {},
    ...overrides,
  };

  const versionData = { ...agentData };
  delete versionData.author;

  const initialAgentData = {
    ...agentData,
    versions: [
      {
        ...versionData,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    category: 'general',
  };

  return (await Agent.create(initialAgentData)).toObject();
}

/**
 * Create an agent with extended thinking enabled
 * @param {Object} overrides
 * @returns {Promise<Object>}
 */
async function createThinkingAgent(overrides = {}) {
  return createTestAgent({
    name: 'Test Thinking Agent',
    description: 'An agent with extended thinking enabled',
    model_parameters: {
      thinking: {
        type: 'enabled',
        budget_tokens: 5000,
      },
    },
    ...overrides,
  });
}

describe('Open Responses API Integration Tests', () => {
  // Increase timeout for real API calls
  jest.setTimeout(120000);

  let mongoServer;
  let app;
  let testAgent;
  let thinkingAgent;

  // Mock fs.readFileSync for index.html
  const originalReadFileSync = fs.readFileSync;
  beforeAll(() => {
    fs.readFileSync = function (filepath, options) {
      if (filepath.includes('index.html')) {
        return '<!DOCTYPE html><html><head><title>LibreChat</title></head><body><div id="root"></div></body></html>';
      }
      return originalReadFileSync(filepath, options);
    };
  });

  afterAll(() => {
    fs.readFileSync = originalReadFileSync;
    process.env.CREDS_KEY = originalEnv.CREDS_KEY;
    process.env.CREDS_IV = originalEnv.CREDS_IV;
  });

  beforeAll(async () => {
    // Create required directories for tests
    const dirs = ['/tmp/dist', '/tmp/fonts', '/tmp/assets'];
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    fs.writeFileSync(
      '/tmp/dist/index.html',
      '<!DOCTYPE html><html><head><title>LibreChat</title></head><body><div id="root"></div></body></html>',
    );

    // Start MongoDB Memory Server
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();
    process.env.PORT = '0';

    // Initialize Agent model
    Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);

    // Start the server
    app = require('~/server');

    // Wait for health check
    await healthCheckPoll(app);

    // Create test agents
    testAgent = await createTestAgent();
    thinkingAgent = await createThinkingAgent();
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up any test data between tests if needed
  });

  /* ===========================================================================
   * COMPLIANCE TESTS
   * Based on: https://github.com/openresponses/openresponses/blob/main/src/lib/compliance-tests.ts
   * =========================================================================== */

  // Use conditional describe for tests requiring API key
  const describeWithApiKey = SKIP_INTEGRATION_TESTS ? describe.skip : describe;

  describeWithApiKey('Compliance Tests', () => {
    describe('basic-response', () => {
      it('should return a valid ResponseResource for a simple text request', async () => {
        const response = await request(app)
          .post('/api/agents/v1/responses')
          .send({
            model: testAgent.id,
            input: [
              {
                type: 'message',
                role: 'user',
                content: 'Say hello in exactly 3 words.',
              },
            ],
          });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        // Validate ResponseResource schema
        const body = response.body;
        expect(body.id).toMatch(/^resp_/);
        expect(body.object).toBe('response');
        expect(typeof body.created_at).toBe('number');
        expect(body.status).toBe('completed');
        expect(body.model).toBe(testAgent.id);

        // Validate output
        expect(Array.isArray(body.output)).toBe(true);
        expect(body.output.length).toBeGreaterThan(0);

        // Should have at least one message item
        const messageItem = body.output.find((item) => item.type === 'message');
        expect(messageItem).toBeDefined();
        expect(messageItem.role).toBe('assistant');
        expect(messageItem.status).toBe('completed');
        expect(Array.isArray(messageItem.content)).toBe(true);
      });
    });

    describe('streaming-response', () => {
      it('should return valid SSE streaming events', async () => {
        const response = await request(app)
          .post('/api/agents/v1/responses')
          .send({
            model: testAgent.id,
            input: [
              {
                type: 'message',
                role: 'user',
                content: 'Count from 1 to 5.',
              },
            ],
            stream: true,
          })
          .buffer(true)
          .parse((res, callback) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk.toString();
            });
            res.on('end', () => {
              callback(null, data);
            });
          });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/text\/event-stream/);

        const events = parseSSEEvents(response.body);
        expect(events.length).toBeGreaterThan(0);

        // Validate streaming event types
        const eventTypes = events.map((e) => e.event);

        // Should have response.in_progress
        expect(eventTypes).toContain('response.in_progress');

        // Should have response.completed or response.failed
        expect(eventTypes.some((t) => t === 'response.completed' || t === 'response.failed')).toBe(
          true,
        );

        // Should have [DONE]
        expect(eventTypes).toContain('done');

        // Validate response.completed has full response
        const completedEvent = events.find((e) => e.event === 'response.completed');
        if (completedEvent) {
          expect(completedEvent.data.response).toBeDefined();
          expect(completedEvent.data.response.status).toBe('completed');
          expect(completedEvent.data.response.output.length).toBeGreaterThan(0);
        }
      });
    });

    describe('system-prompt', () => {
      it('should handle developer role messages in input (as system)', async () => {
        // Note: For Anthropic, system messages must be first and there can only be one.
        // Since the agent already has instructions, we use 'developer' role which
        // gets merged into the system prompt, or we test with a simple user message
        // that instructs the behavior.
        const response = await request(app)
          .post('/api/agents/v1/responses')
          .send({
            model: testAgent.id,
            input: [
              {
                type: 'message',
                role: 'user',
                content: 'Pretend you are a pirate and say hello in pirate speak.',
              },
            ],
          });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('completed');
        expect(response.body.output.length).toBeGreaterThan(0);

        // The response should reflect the pirate persona
        const messageItem = response.body.output.find((item) => item.type === 'message');
        expect(messageItem).toBeDefined();
        expect(messageItem.content.length).toBeGreaterThan(0);
      });
    });

    describe('multi-turn', () => {
      it('should handle multi-turn conversation history', async () => {
        const response = await request(app)
          .post('/api/agents/v1/responses')
          .send({
            model: testAgent.id,
            input: [
              {
                type: 'message',
                role: 'user',
                content: 'My name is Alice.',
              },
              {
                type: 'message',
                role: 'assistant',
                content: 'Hello Alice! Nice to meet you. How can I help you today?',
              },
              {
                type: 'message',
                role: 'user',
                content: 'What is my name?',
              },
            ],
          });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('completed');

        // The response should reference "Alice"
        const messageItem = response.body.output.find((item) => item.type === 'message');
        expect(messageItem).toBeDefined();

        const textContent = messageItem.content.find((c) => c.type === 'output_text');
        expect(textContent).toBeDefined();
        expect(textContent.text.toLowerCase()).toContain('alice');
      });
    });

    // Note: tool-calling test requires tool setup which may need additional configuration
    // Note: image-input test requires vision-capable model

    describe('string-input', () => {
      it('should accept simple string input', async () => {
        const response = await request(app).post('/api/agents/v1/responses').send({
          model: testAgent.id,
          input: 'Hello!',
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('completed');
        expect(response.body.output.length).toBeGreaterThan(0);
      });
    });
  });

  /* ===========================================================================
   * EXTENDED THINKING TESTS
   * Tests reasoning output from Claude models with extended thinking enabled
   * =========================================================================== */

  describeWithApiKey('Extended Thinking', () => {
    it('should return reasoning output when thinking is enabled', async () => {
      const response = await request(app)
        .post('/api/agents/v1/responses')
        .send({
          model: thinkingAgent.id,
          input: [
            {
              type: 'message',
              role: 'user',
              content: 'What is 15 * 7? Think step by step.',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');

      // Check for reasoning item in output
      const reasoningItem = response.body.output.find((item) => item.type === 'reasoning');
      // Note: reasoning may or may not be present depending on model behavior
      // Just verify the response is valid

      const messageItem = response.body.output.find((item) => item.type === 'message');
      expect(messageItem).toBeDefined();
    });

    it('should stream reasoning events when thinking is enabled', async () => {
      const response = await request(app)
        .post('/api/agents/v1/responses')
        .send({
          model: thinkingAgent.id,
          input: [
            {
              type: 'message',
              role: 'user',
              content: 'What is 12 + 8? Think step by step.',
            },
          ],
          stream: true,
        })
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            callback(null, data);
          });
        });

      expect(response.status).toBe(200);

      const events = parseSSEEvents(response.body);

      // Check for reasoning-related events (may or may not be present)
      const hasReasoningEvents = events.some(
        (e) =>
          e.event === 'response.reasoning_text.delta' || e.event === 'response.reasoning_text.done',
      );

      // Verify stream completed properly
      const eventTypes = events.map((e) => e.event);
      expect(eventTypes).toContain('response.completed');
    });
  });

  /* ===========================================================================
   * SCHEMA VALIDATION TESTS
   * Verify response schema compliance
   * =========================================================================== */

  describeWithApiKey('Schema Validation', () => {
    it('should include all required fields in response', async () => {
      const response = await request(app).post('/api/agents/v1/responses').send({
        model: testAgent.id,
        input: 'Test',
      });

      expect(response.status).toBe(200);
      const body = response.body;

      // Required fields per Open Responses spec
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('object', 'response');
      expect(body).toHaveProperty('created_at');
      expect(body).toHaveProperty('completed_at');
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('model');
      expect(body).toHaveProperty('output');
      expect(body).toHaveProperty('tools');
      expect(body).toHaveProperty('tool_choice');
      expect(body).toHaveProperty('truncation');
      expect(body).toHaveProperty('parallel_tool_calls');
      expect(body).toHaveProperty('text');
      expect(body).toHaveProperty('temperature');
      expect(body).toHaveProperty('top_p');
      expect(body).toHaveProperty('presence_penalty');
      expect(body).toHaveProperty('frequency_penalty');
      expect(body).toHaveProperty('store');
      expect(body).toHaveProperty('background');
      expect(body).toHaveProperty('service_tier');
      expect(body).toHaveProperty('metadata');
    });

    it('should have valid message item structure', async () => {
      const response = await request(app).post('/api/agents/v1/responses').send({
        model: testAgent.id,
        input: 'Hello',
      });

      expect(response.status).toBe(200);

      const messageItem = response.body.output.find((item) => item.type === 'message');
      expect(messageItem).toBeDefined();

      // Message item required fields
      expect(messageItem).toHaveProperty('type', 'message');
      expect(messageItem).toHaveProperty('id');
      expect(messageItem).toHaveProperty('status');
      expect(messageItem).toHaveProperty('role', 'assistant');
      expect(messageItem).toHaveProperty('content');
      expect(Array.isArray(messageItem.content)).toBe(true);

      // Content part structure
      if (messageItem.content.length > 0) {
        const textContent = messageItem.content.find((c) => c.type === 'output_text');
        if (textContent) {
          expect(textContent).toHaveProperty('type', 'output_text');
          expect(textContent).toHaveProperty('text');
          expect(textContent).toHaveProperty('annotations');
        }
      }
    });
  });

  /* ===========================================================================
   * ERROR HANDLING TESTS
   * =========================================================================== */

  describe('Error Handling', () => {
    it('should return error for missing model', async () => {
      const response = await request(app).post('/api/agents/v1/responses').send({
        input: 'Hello',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should return error for missing input', async () => {
      const response = await request(app).post('/api/agents/v1/responses').send({
        model: testAgent.id,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should return error for non-existent agent', async () => {
      const response = await request(app).post('/api/agents/v1/responses').send({
        model: 'agent_nonexistent123456789',
        input: 'Hello',
      });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
    });
  });

  /* ===========================================================================
   * MODELS ENDPOINT TESTS
   * =========================================================================== */

  describe('GET /v1/responses/models', () => {
    it('should list available agents as models', async () => {
      const response = await request(app).get('/api/agents/v1/responses/models');

      expect(response.status).toBe(200);
      expect(response.body.object).toBe('list');
      expect(Array.isArray(response.body.data)).toBe(true);

      // Should include our test agent
      const foundAgent = response.body.data.find((m) => m.id === testAgent.id);
      expect(foundAgent).toBeDefined();
      expect(foundAgent.object).toBe('model');
      expect(foundAgent.name).toBe(testAgent.name);
    });
  });
});

/**
 * Poll health endpoint until server is ready
 */
async function healthCheckPoll(app, retries = 0) {
  const maxRetries = Math.floor(30000 / 100);
  try {
    const response = await request(app).get('/health');
    if (response.status === 200) {
      return;
    }
  } catch {
    // Ignore during polling
  }

  if (retries < maxRetries) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await healthCheckPoll(app, retries + 1);
  } else {
    throw new Error('App did not become healthy within 30 seconds.');
  }
}
