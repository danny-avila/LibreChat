const {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} = require('@aws-sdk/client-bedrock-agent-runtime');

// Configuration validation and setup
class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function validateConfig() {
  const requiredEnvVars = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const missing = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new ConfigurationError(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };
}

// Response processing utilities
class ResponseProcessor {
  static async processStreamingResponse(stream) {
    let text = '';
    for await (const chunk of stream) {
      const chunkText = await this.processChunk(chunk);
      if (chunkText) {
        text += chunkText;
        process.stdout.write(chunkText); // Real-time output
      }
    }
    return text;
  }

  static async processChunk(chunk) {
    // Check for errors first
    if (chunk.headers?.[':exception-type']?.value) {
      const errorMessage = new TextDecoder().decode(chunk.body);
      throw new Error(`AWS Error: ${chunk.headers[':exception-type'].value} - ${errorMessage}`);
    }

    // Process different chunk formats
    if (chunk.chunk?.bytes) {
      return new TextDecoder().decode(chunk.chunk.bytes);
    }
    if (chunk.message) {
      return chunk.message;
    }
    if (chunk.body instanceof Uint8Array) {
      return new TextDecoder().decode(chunk.body);
    }

    console.debug('Unknown chunk format:', {
      type: typeof chunk,
      hasBody: !!chunk.body,
      bodyType: chunk.body ? typeof chunk.body : 'none',
      properties: Object.keys(chunk),
    });
    return '';
  }

  static processNonStreamingResponse(completion) {
    if (completion instanceof Uint8Array) {
      return new TextDecoder().decode(completion);
    }
    if (Buffer.isBuffer(completion)) {
      return completion.toString('utf-8');
    }
    if (typeof completion === 'string') {
      return completion;
    }
    throw new Error('Unexpected completion type from Bedrock agent');
  }
}

// Main agent testing class
class BedrockAgentTester {
  constructor(config) {
    this.client = new BedrockAgentRuntimeClient(config);
  }

  async testAgent({ agentId, agentAliasId }) {
    console.log('\nTesting AWS Bedrock Agent:', { agentId, agentAliasId });

    const input = {
      agentId,
      agentAliasId,
      sessionId: `test-session-${Date.now()}`,
      inputText: 'Hello! Can you tell me what capabilities you have as an agent?',
      enableTrace: true,
    };

    try {
      const command = new InvokeAgentCommand(input);
      const response = await this.client.send(command);

      if (!response.completion) {
        throw new Error('No completion in agent response');
      }

      const text = await this.processResponse(response.completion);

      return {
        text,
        metadata: response.$metadata,
        requestId: response.$metadata?.requestId,
      };
    } catch (error) {
      console.error('Error in agent test:', {
        name: error.name,
        message: error.message,
        code: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
      });
      throw error;
    }
  }

  async processResponse(completion) {
    if (completion?.options?.messageStream) {
      return ResponseProcessor.processStreamingResponse(completion.options.messageStream);
    }
    return ResponseProcessor.processNonStreamingResponse(completion);
  }
}

// Test execution
async function runTests() {
  try {
    const config = validateConfig();
    const tester = new BedrockAgentTester(config);

    // Define agents to test
    const agents = [
      { id: 'FZUSVDW4SR', alias: 'TSTALIASID' },
      { id: 'SLBEYXPT6I', alias: 'TSTALIASID' }
    ];

    let testsPassed = true;

    for (const agent of agents) {
      console.log(`\n=== Testing Agent ${agent.id} ===`);
      try {
        const result = await tester.testAgent({
          agentId: agent.id,
          agentAliasId: agent.alias,
        });

        console.log('\nTest Results:', {
          requestId: result.requestId,
          httpStatus: result.metadata?.httpStatusCode,
          responseLength: result.text.length,
        });
      } catch (error) {
        testsPassed = false;
        console.error(`Test failed for agent ${agent.id}:`, error.message);
      }
    }

    return testsPassed;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error('Configuration Error:', error.message);
    } else {
      console.error('Unexpected Error:', error);
    }
    return false;
  }
}

// Execute tests and handle results
runTests()
  .then((passed) => {
    console.log('\nIntegration Test Status:', {
      passed,
      timestamp: new Date().toISOString(),
      environment: {
        region: process.env.AWS_REGION,
        hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
      },
    });

    if (!passed) {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Fatal error in test execution:', error);
    process.exit(1);
  });
