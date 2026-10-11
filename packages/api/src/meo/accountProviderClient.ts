import { MeoHttpError, meoUpstreamError } from './httpError';

export type MeoCredential = {
  id: string;
  provider: string;
  displayName: string;
  endpoint: string;
  defaultModel: string;
  secretHint: string;
  enabled: boolean;
};

export type MeoModel = {
  id: string;
  name: string;
  description: string;
  inputModalities: string[];
  outputModalities: string[];
};

export type MeoConsent = {
  requestId: string;
  payloadSha256: string;
  confirmationVersion: number;
  provider: string;
  providerName: string;
  model: string;
  purpose: string;
  dataCategories: string[];
  destination: string;
  promptCharacters: number;
  expiresAt: string;
};

export type MeoChatMessage = { role: 'user' | 'assistant'; content: string };

type ClientOptions = {
  accountUrl: string;
  clientId: string;
  accessToken: () => Promise<string>;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

/** Server-side bridge to Meo Account. Provider keys never leave Account. */
export class MeoAccountProviderClient {
  private readonly accountUrl: string;
  private readonly clientId: string;
  private readonly accessToken: () => Promise<string>;
  private readonly fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  constructor(options: ClientOptions) {
    const url = new URL(options.accountUrl);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Meo Account URL must use HTTPS');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error('Meo Account URL must be an origin or path without credentials');
    }
    this.accountUrl = url.toString().replace(/\/$/, '');
    this.clientId = requiredText(options.clientId, 'clientId', 160);
    this.accessToken = options.accessToken;
    this.fetcher = options.fetcher ?? fetch;
  }

  async listConnections(): Promise<MeoCredential[]> {
    const data = await this.call({ action: 'list_credentials' });
    if (!Array.isArray(data.credentials))
      throw new Error('Meo Account returned invalid connections');
    return data.credentials.flatMap((value): MeoCredential[] => {
      if (!value || typeof value !== 'object') return [];
      const row = value as Record<string, unknown>;
      if (
        typeof row.id !== 'string' ||
        typeof row.displayName !== 'string' ||
        typeof row.provider !== 'string' ||
        row.enabled !== true
      )
        return [];
      return [
        {
          id: row.id,
          displayName: row.displayName,
          provider: row.provider,
          endpoint: typeof row.endpoint === 'string' ? row.endpoint : '',
          defaultModel: typeof row.defaultModel === 'string' ? row.defaultModel : '',
          secretHint: typeof row.secretHint === 'string' ? row.secretHint : '',
          enabled: true,
        },
      ];
    });
  }

  async listModels(credentialId: string): Promise<{ supported: boolean; models: MeoModel[] }> {
    const data = await this.call({
      action: 'list_models',
      credentialId: requiredText(credentialId, 'credentialId', 80),
    });
    return {
      supported: data.supported === true,
      models: Array.isArray(data.models) ? data.models.filter(isModel) : [],
    };
  }

  async prepareChat(input: {
    credentialId: string;
    model: string;
    messages: MeoChatMessage[];
  }): Promise<MeoConsent> {
    const { userPrompt, categories } = chatPrompt(input.messages);
    const data = await this.call({
      action: 'prepare_inference',
      credentialId: requiredText(input.credentialId, 'credentialId', 80),
      clientId: this.clientId,
      purpose: 'meo_ai_web_chat',
      dataCategories: categories,
      model: requiredText(input.model, 'model', 160),
      userPrompt,
      temperature: 0.7,
      maxOutputTokens: 2048,
    });
    if (!data.consent || typeof data.consent !== 'object')
      throw new Error('Meo Account returned invalid consent data');
    return data.consent as MeoConsent;
  }

  async invokeChat(input: {
    credentialId: string;
    model: string;
    messages: MeoChatMessage[];
    consent: MeoConsent;
  }): Promise<{ text: string; model: string }> {
    const { userPrompt, categories } = chatPrompt(input.messages);
    const data = await this.call({
      action: 'invoke',
      credentialId: requiredText(input.credentialId, 'credentialId', 80),
      clientId: this.clientId,
      purpose: 'meo_ai_web_chat',
      dataCategories: categories,
      model: requiredText(input.model, 'model', 160),
      userPrompt,
      temperature: 0.7,
      maxOutputTokens: 2048,
      consent: {
        approved: true,
        confirmedAt: new Date().toISOString(),
        requestId: input.consent.requestId,
        payloadSha256: input.consent.payloadSha256,
        confirmationVersion: input.consent.confirmationVersion,
      },
    });
    if (typeof data.text !== 'string') throw new Error('Meo Account returned invalid chat output');
    return { text: data.text, model: typeof data.model === 'string' ? data.model : input.model };
  }

  async streamChat(
    input: {
      credentialId: string;
      model: string;
      messages: MeoChatMessage[];
      consent: MeoConsent;
    },
    signal: AbortSignal,
  ): Promise<Response> {
    const token = (await this.accessToken()).trim();
    if (!token) throw new MeoHttpError(401, 'Meo Account session is unavailable. Sign in again.');
    const { userPrompt, categories } = chatPrompt(input.messages);
    const response = await this.fetcher(`${this.accountUrl}/functions/v1/ai-provider-broker`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        action: 'stream_invoke',
        credentialId: requiredText(input.credentialId, 'credentialId', 80),
        clientId: this.clientId,
        purpose: 'meo_ai_web_chat',
        dataCategories: categories,
        model: requiredText(input.model, 'model', 160),
        userPrompt,
        temperature: 0.7,
        maxOutputTokens: 2048,
        consent: {
          approved: true,
          confirmedAt: new Date().toISOString(),
          requestId: input.consent.requestId,
          payloadSha256: input.consent.payloadSha256,
          confirmationVersion: input.consent.confirmationVersion,
        },
      }),
      redirect: 'error',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      throw meoUpstreamError(response.status);
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      throw new Error('Meo Account returned an invalid chat stream');
    }
    return response;
  }

  private async call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const token = (await this.accessToken()).trim();
    if (!token) throw new MeoHttpError(401, 'Meo Account session is unavailable. Sign in again.');
    const response = await this.fetcher(`${this.accountUrl}/functions/v1/ai-provider-broker`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(body),
      redirect: 'error',
    });
    if (!response.ok) throw meoUpstreamError(response.status);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error('Meo Account returned invalid JSON');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Meo Account returned invalid JSON');
    return data as Record<string, unknown>;
  }
}

function chatPrompt(messages: MeoChatMessage[]) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 80)
    throw new MeoHttpError(400, 'Chat context is invalid');
  const normalized = messages.map((message) => {
    if (
      !message ||
      !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string'
    )
      throw new MeoHttpError(400, 'Chat message is invalid');
    const content = message.content.trim();
    if (!content || content.length > 40000) throw new MeoHttpError(400, 'Chat message is invalid');
    return { role: message.role, content };
  });
  if (normalized[normalized.length - 1]?.role !== 'user')
    throw new MeoHttpError(400, 'The latest chat message must be from the user');
  const history = normalized
    .slice(0, -1)
    .map(({ role, content }) => `${role === 'assistant' ? 'Assistant' : 'User'}: ${content}`)
    .join('\n\n');
  const current = normalized[normalized.length - 1].content;
  const userPrompt = history ? `Conversation so far:\n${history}\n\nUser: ${current}` : current;
  if (userPrompt.length > 40000) throw new MeoHttpError(400, 'Chat context is too large');
  return {
    userPrompt,
    categories: history ? ['chat_text', 'conversation_context'] : ['chat_text'],
  };
}

function isModel(value: unknown): value is MeoModel {
  if (!value || typeof value !== 'object') return false;
  const model = value as Record<string, unknown>;
  return typeof model.id === 'string' && typeof model.name === 'string';
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new MeoHttpError(400, `${label} is invalid`);
  return value.trim();
}
