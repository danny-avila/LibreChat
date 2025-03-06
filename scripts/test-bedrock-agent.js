const {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} = require('@aws-sdk/client-bedrock-agent-runtime');

// Initialize the client with AWS credentials
const client = new BedrockAgentRuntimeClient();

async function testAgentResponse({ agentId, sessionId, inputText }) {
  try {
    console.log('\nTesting Bedrock Agent Response:');
    console.log('================================');
    console.log('Agent ID:', agentId);
    console.log('Session ID:', sessionId);
    console.log('Input Text:', inputText);
    console.log('--------------------------------');

    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId: process.env.BEDROCK_AGENT_ALIAS_ID,
      sessionId,
      inputText,
      enableTrace: true,
    });

    console.log('Sending request to AWS Bedrock...');
    const response = await client.send(command);

    if (!response.completion) {
      throw new Error('No completion in agent response');
    }

    let text;
    if (response.completion?.options?.messageStream) {
      // Handle MessageDecoderStream
      console.log('Detected MessageDecoderStream response...');
      const stream = response.completion.options.messageStream;
      let fullText = '';
      console.log('Starting to read stream chunks...');

      try {
        for await (const chunk of stream) {
          if (chunk.headers?.[':exception-type']?.value) {
            const errorMessage = new TextDecoder().decode(chunk.body);
            console.error('AWS Error:', {
              type: chunk.headers[':exception-type'].value,
              message: errorMessage,
            });
            throw new Error(
              `AWS Error: ${chunk.headers[':exception-type'].value} - ${errorMessage}`,
            );
          }

          if (typeof chunk === 'string') {
            fullText += chunk;
          } else if (chunk.chunk?.bytes) {
            fullText += new TextDecoder().decode(chunk.chunk.bytes);
          } else if (chunk.message) {
            fullText += chunk.message;
          } else if (chunk.body instanceof Uint8Array) {
            fullText += new TextDecoder().decode(chunk.body);
          } else {
            console.debug('Processing chunk:', {
              type: typeof chunk,
              hasBody: !!chunk.body,
              bodyType: chunk.body ? typeof chunk.body : 'none',
              properties: Object.keys(chunk),
            });
          }
        }

        if (!fullText) {
          throw new Error('No text content received from stream');
        }

        text = fullText;
      } catch (error) {
        console.error('Error processing stream:', error);
        throw error;
      }
    } else if (response.completion instanceof Uint8Array) {
      text = new TextDecoder().decode(response.completion);
    } else if (Buffer.isBuffer(response.completion)) {
      text = response.completion.toString('utf-8');
    } else if (typeof response.completion === 'string') {
      text = response.completion;
    } else {
      console.error('Unexpected completion type:', {
        type: typeof response.completion,
        value: response.completion,
        hasMessageStream: !!response.completion?.options?.messageStream,
      });
      throw new Error('Unexpected completion type from Bedrock agent');
    }

    console.log('\nAgent Response:');
    console.log('--------------------------------');
    console.log(text);
    console.log('--------------------------------');

    return {
      text,
      metadata: response.$metadata,
      requestId: response.$metadata?.requestId,
    };
  } catch (error) {
    console.error('\nError testing agent:', {
      name: error.name,
      message: error.message,
      code: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
    });
    throw error;
  }
}

async function main() {
  try {
    const testInput = {
      agentId: process.env.BEDROCK_AGENT_ID,
      sessionId: 'test-session-' + Date.now(),
      inputText: 'Hey! What is the purpose of life?',
    };

    const result = await testAgentResponse(testInput);
    console.log('\nTest completed successfully!');
    console.log('Request ID:', result.requestId);
    console.log('HTTP Status:', result.metadata?.httpStatusCode);
  } catch (error) {
    console.error('\nTest failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
