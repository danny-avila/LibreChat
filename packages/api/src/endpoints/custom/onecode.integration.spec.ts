import http from 'node:http';
import { once } from 'node:events';
import { ChatOpenAI } from '@langchain/openai';
import { buildOneCodeLLMConfig } from './onecode';

it('sends one HTTP request when OneCode returns a retryable 504', async () => {
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    req.resume();
    res.writeHead(504, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        error: { type: 'model_provider_timeout', message: 'timed out' },
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('test server did not expose a TCP port');
  }
  try {
    const llmConfig = buildOneCodeLLMConfig(
      {
        apiKey: 'test-key',
        model: 'onecode-agent',
        streaming: false,
        maxRetries: 6,
      },
      undefined,
    );
    const model = new ChatOpenAI({
      ...(llmConfig as ConstructorParameters<typeof ChatOpenAI>[0]),
      configuration: { baseURL: `http://127.0.0.1:${address.port}/v1` },
    });
    await expect(model.invoke('inspect project')).rejects.toThrow();
    expect(requestCount).toBe(1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error == null ? resolve() : reject(error)));
    });
  }
});
