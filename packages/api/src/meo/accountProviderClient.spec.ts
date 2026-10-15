import { MeoAccountProviderClient } from './accountProviderClient';

describe('MeoAccountProviderClient', () => {
  const fetcher = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({}),
  );
  let client: MeoAccountProviderClient;
  beforeEach(() => {
    fetcher.mockReset();
    fetcher.mockImplementation(async () => Response.json({ credentials: [] }));
    client = new MeoAccountProviderClient({
      apiUrl: 'https://api.example.test',
      clientId: 'meo-ai-web',
      accessToken: async () => 'account-session-token',
      fetcher,
    });
  });

  it('lists metadata through the account broker without exposing a key', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({
        credentials: [
          {
            id: 'credential-id',
            provider: 'openai',
            displayName: 'Personal',
            endpoint: 'https://api.openai.com/v1',
            defaultModel: 'gpt-test',
            secretHint: '••••1234',
            enabled: true,
            apiKey: 'must-not-leak',
          },
        ],
      }),
    );
    const connections = await client.listConnections();
    expect(connections[0].id).toBe('credential-id');
    expect(JSON.stringify(connections)).not.toContain('apiKey');
    expect(JSON.stringify(connections)).not.toContain('must-not-leak');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.example.test/v1/ai/provider-broker');
    expect(fetcher.mock.calls[0][1]?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer account-session-token',
        'Cache-Control': 'no-store',
      }),
    );
  });

  it('normalizes model discovery and allows unsupported providers to use manual IDs', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({
        supported: true,
        models: [{ id: 'model-a', name: 'Model A' }],
      }),
    );
    expect(await client.listModels('credential-id')).toEqual({
      supported: true,
      models: [{ id: 'model-a', name: 'Model A' }],
    });
    fetcher.mockResolvedValueOnce(Response.json({ supported: false, models: [] }));
    expect(await client.listModels('credential-id')).toEqual({ supported: false, models: [] });
  });

  it('prepares a payload-bound consent and invokes only with its confirmation fields', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({
        consent: {
          requestId: 'request-id',
          payloadSha256: 'hash',
          confirmationVersion: 1,
          provider: 'openai',
          providerName: 'Personal',
          model: 'gpt-test',
          purpose: 'meo_ai_web_chat',
          dataCategories: ['chat_text'],
          destination: 'https://api.openai.com/v1/responses',
          promptCharacters: 12,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    );
    const messages = [{ role: 'user' as const, content: 'Hi' }];
    const consent = await client.prepareChat({
      credentialId: 'credential-id',
      model: 'gpt-test',
      messages,
    });
    const prepared = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(prepared.action).toBe('prepare_inference');
    expect(prepared.userPrompt).toBe('Hi');
    expect(prepared.clientId).toBe('meo-ai-web');

    fetcher.mockResolvedValueOnce(Response.json({ text: 'Hello', model: 'gpt-test' }));
    await expect(
      client.invokeChat({ credentialId: 'credential-id', model: 'gpt-test', messages, consent }),
    ).resolves.toEqual({ text: 'Hello', model: 'gpt-test' });
    const invocation = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(invocation.action).toBe('invoke');
    expect(invocation.consent).toEqual(
      expect.objectContaining({
        approved: true,
        requestId: 'request-id',
        payloadSha256: 'hash',
      }),
    );
    expect(JSON.stringify(invocation)).not.toContain('account-session-token');
  });

  it('requests a real Account SSE stream and propagates browser cancellation', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: delta\n\n'));
        controller.close();
      },
    });
    fetcher.mockResolvedValueOnce(
      new Response(source, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
    const controller = new AbortController();
    const consent = {
      requestId: 'request-id',
      payloadSha256: 'hash',
      confirmationVersion: 1,
      provider: 'openai_compatible',
      providerName: 'OpenLux',
      model: 'model-a',
      purpose: 'meo_ai_web_chat',
      dataCategories: ['chat_text'],
      destination: 'https://api.openlux.ai/v1/chat/completions',
      promptCharacters: 2,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const response = await client.streamChat(
      {
        credentialId: 'credential-id',
        model: 'model-a',
        messages: [{ role: 'user', content: 'Hi' }],
        consent,
      },
      controller.signal,
    );
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(request.action).toBe('stream_invoke');
    expect(request.model).toBe('model-a');
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(fetcher.mock.calls[0][1]?.headers).toEqual(
      expect.objectContaining({ Accept: 'text/event-stream' }),
    );
    expect(await response.text()).toContain('event: delta');
    expect(JSON.stringify(request)).not.toContain('account-session-token');
  });

  it('rejects public HTTP origins and malformed chat context', async () => {
    expect(
      () =>
        new MeoAccountProviderClient({
          apiUrl: 'http://account.example.org',
          clientId: 'meo-ai-web',
          accessToken: async () => 'token',
          fetcher,
        }),
    ).toThrow('must use HTTPS');
    await expect(
      client.prepareChat({
        credentialId: 'credential-id',
        model: 'gpt-test',
        messages: [{ role: 'assistant', content: 'Only assistant' } as never],
      }),
    ).rejects.toThrow('latest chat message must be from the user');
  });
});
