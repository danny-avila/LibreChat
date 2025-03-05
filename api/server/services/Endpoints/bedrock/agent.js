const {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} = require('@aws-sdk/client-bedrock-agent-runtime');
const { TextDecoder } = require('util');

class BedrockAgentClient {
  constructor(config) {
    this.client = new BedrockAgentRuntimeClient();
  }

  async sendMessage({ agentId, agentAliasId, sessionId, inputText }) {
    try {
      const command = new InvokeAgentCommand({
        agentId,
        agentAliasId,
        sessionId,
        inputText,
        enableTrace: true,
      });

      const response = await this.client.send(command);

      if (!response.completion) {
        throw new Error('No completion in agent response');
      }

      let text = '';
      if (response.completion?.options?.messageStream) {
        const stream = response.completion.options.messageStream;
        for await (const chunk of stream) {
          if (chunk.headers?.[':exception-type']?.value) {
            const errorMessage = new TextDecoder().decode(chunk.body);
            throw new Error(
              `AWS Error: ${chunk.headers[':exception-type'].value} - ${errorMessage}`,
            );
          }

          let chunkText = '';
          if (chunk.chunk?.bytes) {
            chunkText = new TextDecoder().decode(chunk.chunk.bytes);
          } else if (chunk.message) {
            chunkText = chunk.message;
          } else if (chunk.body instanceof Uint8Array) {
            chunkText = new TextDecoder().decode(chunk.body);
          } else {
            continue;
          }

          try {
            const jsonData = JSON.parse(chunkText);
            let extractedText = '';

            // Try to extract text from various possible locations in the response
            if (jsonData.content?.[0]?.text) {
              const match = jsonData.content[0].text.match(/<answer>(.*?)<\/answer>/s);
              extractedText = match ? match[1].trim() : jsonData.content[0].text;
            } else if (jsonData.trace?.orchestrationTrace?.observation?.finalResponse?.text) {
              extractedText = jsonData.trace.orchestrationTrace.observation.finalResponse.text;
            } else if (jsonData.trace?.orchestrationTrace?.modelInvocationOutput?.text) {
              const match =
                jsonData.trace.orchestrationTrace.modelInvocationOutput.text.match(
                  /<answer>(.*?)<\/answer>/s,
                );
              extractedText = match
                ? match[1].trim()
                : jsonData.trace.orchestrationTrace.modelInvocationOutput.text;
            }

            // Only append non-empty, non-JSON-like text
            if (extractedText && !extractedText.includes('{') && !extractedText.includes('}')) {
              text += extractedText;
            }
          } catch (err) {
            // Only append text if it doesn't look like JSON
            if (!chunkText.includes('{') && !chunkText.includes('}')) {
              text += chunkText;
            }
          }
        }
      } else if (response.completion instanceof Uint8Array) {
        const rawText = new TextDecoder().decode(response.completion);
        try {
          const jsonData = JSON.parse(rawText);
          if (jsonData.trace?.orchestrationTrace?.observation?.finalResponse?.text) {
            text = jsonData.trace.orchestrationTrace.observation.finalResponse.text;
          } else {
            text = rawText;
          }
        } catch (err) {
          text = rawText;
        }
      } else if (Buffer.isBuffer(response.completion)) {
        const rawText = response.completion.toString('utf-8');
        try {
          const jsonData = JSON.parse(rawText);
          if (jsonData.trace?.orchestrationTrace?.observation?.finalResponse?.text) {
            text = jsonData.trace.orchestrationTrace.observation.finalResponse.text;
          } else {
            text = rawText;
          }
        } catch (err) {
          text = rawText;
        }
      } else if (typeof response.completion === 'string') {
        try {
          const jsonData = JSON.parse(response.completion);
          if (jsonData.trace?.orchestrationTrace?.observation?.finalResponse?.text) {
            text = jsonData.trace.orchestrationTrace.observation.finalResponse.text;
          } else {
            text = response.completion;
          }
        } catch (err) {
          text = response.completion;
        }
      } else {
        console.error('Unexpected completion type:', {
          type: typeof response.completion,
          value: response.completion,
          hasMessageStream: !!response.completion?.options?.messageStream,
        });
        throw new Error('Unexpected completion type from Bedrock agent');
      }

      return {
        text,
        metadata: response.$metadata,
        requestId: response.$metadata?.requestId,
      };
    } catch (error) {
      console.error('Error in agent response:', error);
      throw error;
    }
  }
}

module.exports = BedrockAgentClient;
