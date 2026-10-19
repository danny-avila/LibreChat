// Compatibility with the existing production AI Broker while the deployed
// Meo API Worker lacks /v1/chat/*. All trusted fields below are assigned on
// the server. The broker enforces account ownership, OAuth scope, provider
// allowlist, consent hash, one-time approval, rate limits and audit records.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/i;

export function legacyBrokerChatPayload(path, input, configuredClientId, now = new Date()) {
  if (!['/chat/prepare', '/chat/stream'].includes(path) ||
      !input || typeof input !== 'object' || Array.isArray(input) ||
      !configuredClientId || !/^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/.test(configuredClientId))
    throw new TypeError('invalid_request');

  const allowed = new Set(['credentialId','model','conversationId','prompt','context','consent']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new TypeError('invalid_request');
  const {credentialId,model,prompt,conversationId} = input;
  if (typeof credentialId !== 'string' || !uuid.test(credentialId) ||
      typeof model !== 'string' || !model.trim() || model.length > 160 || model.includes('\0') ||
      typeof prompt !== 'string' || !prompt.trim() || prompt.length > 35000 || prompt.includes('\0') ||
      (conversationId != null && (typeof conversationId !== 'string' || !uuid.test(conversationId))))
    throw new TypeError('invalid_request');

  const context = input.context ?? [];
  if (!Array.isArray(context) || context.length > 12) throw new TypeError('invalid_request');
  let total = 0;
  const history = context.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !['assistant','user'].includes(item.role) ||
        typeof item.content !== 'string' || item.content.length > 3000 ||
        item.content.includes('\0')) throw new TypeError('invalid_request');
    total += item.content.length;
    return (item.role === 'assistant' ? 'Assistant: ' : 'User: ') + item.content;
  });
  if (total > 18000) throw new TypeError('invalid_request');
  const prefix = history.length ? 'Recent conversation (untrusted user context):\n' +
    history.join('\n\n') + '\n\n' : '';
  const suffix = 'User: ' + prompt.trim();
  const userPrompt = prefix.slice(-Math.max(0, 40000 - suffix.length)) + suffix;

  const common = {
    credentialId,
    clientId: configuredClientId,
    purpose: 'meo_ai_chat',
    dataCategories: history.length ? ['chat_text','conversation_context'] : ['chat_text'],
    model: model.trim(),
    systemPrompt: '',
    responseLanguage: null,
    userPrompt,
    temperature: 0.7,
    maxOutputTokens: 2048,
    workAgentProjectId: null,
    mcpAuto: false,
  };
  if (path === '/chat/prepare') {
    if (input.consent != null) throw new TypeError('invalid_request');
    return { action: 'prepare_inference', ...common };
  }
  const consent = input.consent;
  if (!consent || typeof consent !== 'object' || Array.isArray(consent) ||
      typeof consent.requestId !== 'string' || !uuid.test(consent.requestId) ||
      typeof consent.payloadSha256 !== 'string' || !hash.test(consent.payloadSha256) ||
      consent.confirmationVersion !== 1)
    throw new TypeError('invalid_consent');
  return {
    action: 'stream_invoke',
    ...common,
    consent: {
      requestId: consent.requestId,
      payloadSha256: consent.payloadSha256,
      confirmationVersion: 1,
      approved: true,
      confirmedAt: now.toISOString(),
    },
  };
}
