const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '../..') });
const envPath = path.join(__dirname, '../../../.env');
require('dotenv').config({ path: envPath });

const helpersPath = path.resolve(__dirname, '../../server/controllers/assistants/helpers');
const configPath = path.resolve(__dirname, '../../server/services/Config/index');
const e2bModelsPath = path.resolve(__dirname, '../../models/E2BAssistant');
const e2bInitializePath = path.resolve(__dirname, '../../server/services/Endpoints/e2bAssistants/initialize');

// 1. Mock Dependencies BEFORE anything else
const mockAssistant = {
  id: 'test-assistant-id',
  name: 'Mock Data Analyst',
  instructions: 'You are a python data analyst. Use the provided tools to help the user.',
  model: 'gpt-4o',
  e2b_sandbox_template: 'code-interpreter',
  e2b_config: { timeout_ms: 300000, max_memory_mb: 2048, max_cpu_percent: 80 }
};

// Clear cache
[helpersPath, configPath, e2bModelsPath, e2bInitializePath].forEach(p => delete require.cache[p + '.js']);

// Mock E2B Models
require.cache[e2bModelsPath + '.js'] = {
  id: e2bModelsPath + '.js', filename: e2bModelsPath + '.js', loaded: true,
  exports: {
    createE2BAssistantDoc: async (data) => ({ ...data, createdAt: new Date() }),
    getE2BAssistantDocs: async () => [mockAssistant],
    updateE2BAssistantDoc: async (id, data) => ({ ...mockAssistant, ...data }),
    deleteE2BAssistantDoc: async () => true,
  }
};

// Mock Config
require.cache[configPath + '.js'] = {
  id: configPath + '.js', filename: configPath + '.js', loaded: true,
  exports: { getEndpointsConfig: async () => ({}) }
};

// Mock OpenAI Client (The Heart of the Test Loop)
const mockOpenAI = {
  chat: {
    completions: {
      create: async ({ messages }) => {
        const lastMessage = messages[messages.length - 1];
        
        // Step 1: User asks a question -> LLM decides to call a tool
        if (lastMessage.role === 'user') {
          console.log('🤖 [Mock LLM] Decided to call tool: execute_code');
          return {
            choices: [{
              message: {
                role: 'assistant',
                content: 'Let me calculate that for you.',
                tool_calls: [{
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'execute_code',
                    arguments: JSON.stringify({ code: 'import math; print(math.sqrt(144))' })
                  }
                }]
              }
            }]
          };
        }
        
        // Step 2: Tool result is provided -> LLM gives final answer
        if (lastMessage.role === 'tool') {
          console.log('🤖 [Mock LLM] Received tool output, generating final answer...');
          return {
            choices: [{
              message: {
                role: 'assistant',
                content: 'The square root of 144 is 12.0.'
              }
            }]
          };
        }

        return { choices: [{ message: { role: 'assistant', content: 'I am not sure how to respond.' } }] };
      }
    }
  }
};

// Mock Helpers
require.cache[helpersPath + '.js'] = {
  id: helpersPath + '.js', filename: helpersPath + '.js', loaded: true,
  exports: {
    getOpenAIClient: async () => ({ openai: mockOpenAI }),
    getCurrentVersion: async () => 'v2',
    fetchAssistants: async () => ({ data: [mockAssistant] })
  }
};

// Mock Sandbox
const mockSandbox = {
  sandboxId: 'mock-sandbox-id',
  runCode: async (code) => {
    console.log(`💻 [Mock Sandbox] Executing: ${code}`);
    return { logs: { stdout: [{ message: '12.0\n' }], stderr: [] }, results: [], exitCode: 0 };
  },
  files: { write: async () => ({ size: 100 }), read: async () => Buffer.from('mock data') },
  kill: async () => {}
};

require.cache[e2bInitializePath + '.js'] = {
  id: e2bInitializePath + '.js', filename: e2bInitializePath + '.js', loaded: true,
  exports: {
    initializeClient: async () => ({ e2bClient: {} }),
    e2bClientManager: {
      createSandbox: async () => mockSandbox,
      getSandbox: async () => ({ sandbox: mockSandbox }),
      executeCode: async (userId, conversationId, code) => {
        const res = await mockSandbox.runCode(code);
        return { success: true, stdout: res.logs.stdout, stderr: res.logs.stderr, results: res.results, exitCode: res.exitCode };
      },
      killSandbox: async () => {}
    }
  }
};

// 2. Now require controller
const controller = require('../../server/routes/e2bAssistants/controller');

// Mock Response
const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
};

async function runTest() {
  console.log('🚀 Starting Pure Local E2B Agent Integration Test...');

  const user = { id: 'test-user-id', username: 'Tester' };

  try {
    const chatReq = {
      user,
      baseUrl: '/api/e2b-assistants',
      config: { endpoints: {} },
      params: { assistant_id: 'test-assistant-id' },
      body: {
        text: 'Calculate the square root of 144 using python code.',
        conversationId: 'test-convo-id',
      }
    };
    const chatRes = mockRes();

    console.log('--- Starting Agent Loop ---');
    await controller.chat(chatReq, chatRes);

    if (chatRes.body && chatRes.body.text) {
      console.log('\n✅ Chat Response Received:');
      console.log('---------------------------------------------------');
      console.log(chatRes.body.text);
      console.log('---------------------------------------------------');
      
      if (chatRes.body.intermediateSteps) {
        console.log('🛠️  Tool Executions:', chatRes.body.intermediateSteps.length);
        chatRes.body.intermediateSteps.forEach(step => {
          console.log(`   - Tool: ${step.tool}`);
          console.log(`     Output: ${JSON.stringify(step.observation)}`);
        });
      }
    } else {
      console.error('❌ Chat Failed:', chatRes.body);
    }

  } catch (error) {
    console.error('❌ Test Failed:', error);
  }
  
  process.exit(0);
}

runTest();
