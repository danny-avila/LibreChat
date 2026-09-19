// Read-only probe: run from LibreChat; synthetic config and database, no provider calls.
const { createRequire } = require('node:module');
const requireFromCheckout = createRequire(`${process.cwd()}/package.json`);
const { createMediaCredentialResolver, createRESTMediaAdapters, createNativeMediaFactory, createMediaTransport, applyAxiosProxyConfig } = requireFromCheckout('@librechat/api');
const { resolveMediaConfig } = requireFromCheckout('librechat-data-provider');
const { z } = requireFromCheckout('zod');
(async () => {
  const integration = {
    id: 'fixture-google', api: 'google.generateContent', endpointRef: { kind: 'builtin', endpoint: 'google' },
    catalog: { kind: 'configured', models: ['gemini-2.5-flash-image'] }, operations: ['image.generate'],
  };
  const config = {
    config: {}, fileStrategy: 'local', imageOutputType: 'png',
    media: resolveMediaConfig({ enabled: true, integrations: [integration] }),
    endpoints: {
      all: { headers: { 'X-Global': 'required-global' } },
      google: { headers: { 'X-Google': 'required-google' } },
      custom: [{ name: 'Gateway', apiKey: 'fixture-key', baseURL: 'https://gateway.example/v1',
        headers: { 'X-User': '{{LIBRECHAT_USER_ID}}', 'X-Tenant': '{{LIBRECHAT_USER_TENANTID}}' } }],
    },
  };
  const scope = { ownerId: 'fixture-user', tenantId: 'fixture-tenant' };
  const resolve = createMediaCredentialResolver({
    environment: { GOOGLE_KEY: 'fixture-key', GOOGLE_AUTH_HEADER: 'true' },
    repository: { getStoredMediaCredential: async () => null },
    decrypt: async value => value, now: () => 0, adapters: createRESTMediaAdapters(),
  });
  for (const [api, endpointRef] of [
    ['google.generateContent', { kind: 'builtin', endpoint: 'google' }],
    ['openai.images', { kind: 'custom', name: 'Gateway' }],
  ]) {
    const connection = await resolve({ scope, integration: { ...integration, api, endpointRef }, appConfig: config, minValidityMs: 0 });
    console.log(JSON.stringify({ endpointRef, headers: connection.headers }));
  }
  const credentialResolver = createMediaCredentialResolver({
    environment: { GOOGLE_KEY: 'user_provided' },
    repository: { getStoredMediaCredential: async () => ({
      value: JSON.stringify({ GOOGLE_API_KEY: 'fixture-key' }),
      expiresAt: new Date(30000).toISOString(), bindingRevision: 'fixture',
    }) },
    decrypt: async value => value, now: () => 0, adapters: createRESTMediaAdapters(),
  });
  const factory = createNativeMediaFactory({
    deps: { resolveConnection: credentialResolver }, repository: {},
    context: { scope, config: config.media, appConfig: config },
    source: { conversationId: 'fixture-conversation', messageId: 'fixture-message', prompt: 'hello', temporary: false },
  });
  try {
    await factory({ provider: 'google', model: 'gemini-2.5-flash', apiKey: 'fixture-key', responseModalities: ['TEXT'] });
    console.log('Text-only chat with a 30-second-valid credential: success');
  } catch (error) {
    console.log(JSON.stringify({ case: 'Text-only Google chat with a 30-second-valid credential', code: error.code, message: error.message }));
  }
  process.env.PROXY = 'http://proxy.fixture.invalid:8080';
  const chat = {};
  applyAxiosProxyConfig(chat, 'https://provider.fixture.invalid/v1');
  console.log(JSON.stringify({ case: 'Existing proxy helper', proxy: chat.proxy ?? null,
    httpAgent: chat.httpAgent?.constructor.name, httpsAgent: chat.httpsAgent?.constructor.name }));
  const transport = createMediaTransport({ http: { request: async options => {
    console.log(JSON.stringify({ case: 'Media transport', proxy: options.proxy ?? null,
      httpAgent: options.httpAgent?.constructor.name, httpsAgent: options.httpsAgent?.constructor.name }));
    return { status: 200, data: '{}' };
  } } });
  await transport.json({ url: 'https://provider.fixture.invalid/v1', timeoutMs: 1000, maxBytes: 100 }, z.object({}));
  process.exit(0);
})().catch((error) => { console.error(error.name, error.message); process.exit(1); });
