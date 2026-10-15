import { MeoHttpError, meoUpstreamError } from './httpError';

export type MeoConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type MeoConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type ClientOptions = {
  apiUrl: string;
  accessToken: () => Promise<string>;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

/** Same-origin API backing for Account-authenticated, cloud-owned chat history. */
export class MeoCloudConversationClient {
  private readonly apiUrl: string;
  private readonly accessToken: () => Promise<string>;
  private readonly fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  constructor(options: ClientOptions) {
    const url = new URL(options.apiUrl);
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    ) {
      throw new Error('Meo API URL must use HTTPS');
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['', '/'].includes(url.pathname)
    ) {
      throw new Error('Meo API URL must be an origin or path without credentials');
    }
    this.apiUrl = url.toString().replace(/\/$/, '');
    this.accessToken = options.accessToken;
    this.fetcher = options.fetcher ?? fetch;
  }

  async listConversations(
    cursor = '',
  ): Promise<{ conversations: MeoConversationSummary[]; nextCursor: string | null }> {
    if (typeof cursor !== 'string' || cursor.length > 512)
      throw new MeoHttpError(400, 'Conversation cursor is invalid');
    const query = new URLSearchParams({ limit: '50' });
    if (cursor) query.set('cursor', cursor);
    const data = await this.call(`/v1/conversations?${query}`);
    if (!Array.isArray(data.conversations)) throw new Error('Meo Cloud returned invalid history');
    const conversations = data.conversations.flatMap((value): MeoConversationSummary[] => {
      if (!value || typeof value !== 'object') return [];
      const row = value as Record<string, unknown>;
      if (typeof row.id !== 'string') return [];
      return [
        {
          id: row.id,
          title: typeof row.title === 'string' ? row.title : '',
          createdAt: typeof row.created_at === 'string' ? row.created_at : '',
          updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
        },
      ];
    });
    return {
      conversations,
      nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
    };
  }

  async createConversation(title: string): Promise<MeoConversationSummary> {
    const data = await this.call('/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: requiredText(title, 'title', 200) }),
    });
    return conversationFrom(data.conversation);
  }

  async listMessages(conversationId: string): Promise<MeoConversationMessage[]> {
    const data = await this.call(
      `/v1/conversations/${encodeURIComponent(requiredText(conversationId, 'conversationId', 80))}/messages`,
    );
    if (!Array.isArray(data.messages)) throw new Error('Meo Cloud returned invalid messages');
    return data.messages.flatMap((value): MeoConversationMessage[] => {
      if (!value || typeof value !== 'object') return [];
      const row = value as Record<string, unknown>;
      if (!['user', 'assistant'].includes(String(row.role))) return [];
      return [
        {
          id: typeof row.id === 'string' ? row.id : '',
          role: row.role as MeoConversationMessage['role'],
          content: messageText(row.content),
          createdAt: typeof row.created_at === 'string' ? row.created_at : '',
        },
      ];
    });
  }

  async appendMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<MeoConversationMessage> {
    const data = await this.call(
      `/v1/conversations/${encodeURIComponent(requiredText(conversationId, 'conversationId', 80))}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ role, content: requiredText(content, 'content', 40000) }),
      },
    );
    const row = data.message;
    if (!row || typeof row !== 'object') throw new Error('Meo Cloud returned invalid message');
    const message = row as Record<string, unknown>;
    return {
      id: typeof message.id === 'string' ? message.id : '',
      role,
      content: messageText(message.content),
      createdAt: typeof message.created_at === 'string' ? message.created_at : '',
    };
  }

  private async call(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const token = (await this.accessToken()).trim();
    if (!token) throw new MeoHttpError(401, 'Meo Account session is unavailable. Sign in again.');
    const response = await this.fetcher(`${this.apiUrl}${path}`, {
      ...init,
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...init?.headers,
      },
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok) throw meoUpstreamError(response.status);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error('Meo Cloud returned invalid JSON');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Meo Cloud returned invalid JSON');
    return data as Record<string, unknown>;
  }
}

function conversationFrom(value: unknown): MeoConversationSummary {
  if (!value || typeof value !== 'object')
    throw new Error('Meo Cloud returned invalid conversation');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string') throw new Error('Meo Cloud returned invalid conversation');
  return {
    id: row.id,
    title: typeof row.title === 'string' ? row.title : '',
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
  };
}

function messageText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .flatMap((part) => {
      if (!part || typeof part !== 'object') return [];
      const text = (part as Record<string, unknown>).text;
      return typeof text === 'string' ? [text] : [];
    })
    .join('');
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new MeoHttpError(400, `${label} is invalid`);
  }
  return value.trim();
}
