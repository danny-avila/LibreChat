import { FileContext } from 'librechat-data-provider';
import type { AxiosRequestConfig } from 'axios';
import { createRagContextHandlers } from './context';

const req: { user: { id: string }; config?: { timeouts?: { ragMs?: number } } } = {
  user: { id: 'user-1' },
};
const files = ['a.pdf', 'b.pdf', 'c.pdf'].map((filename, index) => ({
  file_id: `file-${index}`,
  filename,
  type: 'application/pdf',
  embedded: true,
}));

function setup(
  userMessageContent?: string,
  fullContextSetting?: string,
  ragApiUrl = 'http://rag',
  request = req,
) {
  const httpClient = {
    get: jest.fn().mockResolvedValue({ data: 'whole document' }),
    post: jest.fn().mockResolvedValue({ data: [[{ page_content: 'Relevant excerpt' }, 0.1]] }),
  };
  const generateShortLivedToken = jest.fn(() => 'signed-token');
  const isEnabled = jest.fn((setting?: string | boolean | null) => setting === 'true');
  const logAxiosError = jest.fn(() => 'logged');
  const handlers = createRagContextHandlers({
    req: request,
    userMessageContent,
    ragApiUrl,
    fullContextSetting,
    httpClient,
    generateShortLivedToken,
    isEnabled,
    logAxiosError,
  });
  return { handlers, httpClient, generateShortLivedToken, isEnabled, logAxiosError };
}

describe('legacy RAG context', () => {
  it.each(['', ' ', '\t\n ', undefined])(
    'skips searches for a blank message (%j), even across several files',
    async (text) => {
      const { handlers, httpClient } = setup(text);
      for (const file of files) {
        await handlers?.processFile(file);
      }
      expect(await handlers?.createContext()).toBe('');
      expect(httpClient.post).not.toHaveBeenCalled();
      expect(httpClient.get).not.toHaveBeenCalled();
    },
  );

  it('retains the original query and formats valid search results', async () => {
    const { handlers, httpClient } = setup('  what is the deadline?  ');
    await handlers?.processFile(files[0]);
    await handlers?.processFile(files[0]);
    expect(await handlers?.createContext()).toContain('Relevant excerpt');
    expect(httpClient.post).toHaveBeenCalledTimes(1);
    expect(httpClient.post).toHaveBeenCalledWith(
      'http://rag/query',
      { file_id: 'file-0', query: '  what is the deadline?  ', k: 4 },
      {
        headers: { Authorization: 'Bearer signed-token', 'Content-Type': 'application/json' },
        timeout: 30_000,
        signal: expect.any(AbortSignal),
        timeoutErrorMessage: expect.any(String),
      },
    );
  });

  it('bounds RAG queries by the configured timeout', async () => {
    const { handlers, httpClient } = setup('deadline?', undefined, 'http://rag', {
      ...req,
      config: { timeouts: { ragMs: 5_000 } },
    });
    await handlers?.processFile(files[0]);
    await handlers?.createContext();
    expect(httpClient.post.mock.calls[0][2]).toMatchObject({ timeout: 5_000 });
  });

  it('continues to fetch the full document for a blank message in full-context mode', async () => {
    const { handlers, httpClient } = setup('', 'true');
    await handlers?.processFile(files[0]);
    expect(await handlers?.createContext()).toContain('whole document');
    expect(httpClient.post).not.toHaveBeenCalled();
    expect(httpClient.get).toHaveBeenCalledWith('http://rag/documents/file-0/context', {
      headers: { Authorization: 'Bearer signed-token' },
      timeout: 30_000,
      signal: expect.any(AbortSignal),
      timeoutErrorMessage: expect.any(String),
    });
  });

  it('does nothing when RAG is disabled, without looking at the request', () => {
    const { handlers, generateShortLivedToken, isEnabled } = setup('', 'true', '');
    expect(handlers).toBeUndefined();
    expect(generateShortLivedToken).not.toHaveBeenCalled();
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('preserves failed-request behavior for a nonblank query', async () => {
    const { handlers, httpClient, logAxiosError } = setup('question');
    const failure = new Error('backend unavailable');
    httpClient.post.mockRejectedValueOnce(failure);
    await handlers?.processFile(files[0]);
    await expect(handlers?.createContext()).rejects.toBe(failure);
    expect(logAxiosError).toHaveBeenCalledWith({
      message: 'Error creating context',
      error: failure,
    });
  });
});

describe('legacy RAG context for files embedded under an agent', () => {
  const agentFile = {
    file_id: 'agent-file',
    filename: 'policy.pdf',
    type: 'application/pdf',
    embedded: true,
    context: FileContext.agents,
    metadata: { embeddedEntities: ['agent_a'] },
  };

  /** Mirrors rag-api v0.9.0: the top chunk's owner must be the entity_id or the token's user. */
  function fakeRag(owners: Record<string, string>) {
    const allowed = (fileId: string, entityId?: string) =>
      owners[fileId] === entityId || owners[fileId] === req.user.id;
    return {
      get: jest.fn().mockImplementation(async (url: string, config?: AxiosRequestConfig) => {
        const fileId = url.split('/documents/')[1].split('/')[0];
        return { data: allowed(fileId, config?.params?.entity_id) ? 'whole policy' : '' };
      }),
      post: jest
        .fn()
        .mockImplementation(
          async (_url: string, body: { file_id: string; entity_id?: string }) => ({
            data: allowed(body.file_id, body.entity_id)
              ? [[{ page_content: 'Policy excerpt' }, 0.1]]
              : [],
          }),
        ),
    };
  }

  function setupWithRag(
    httpClient: ReturnType<typeof fakeRag>,
    extra: Pick<Parameters<typeof createRagContextHandlers>[0], 'hasEntityEmbeddings'> = {},
    fullContextSetting?: string,
  ) {
    const logAxiosError = jest.fn(() => 'logged');
    const handlers = createRagContextHandlers({
      req,
      userMessageContent: 'what does the policy say?',
      ragApiUrl: 'http://rag',
      fullContextSetting,
      httpClient,
      generateShortLivedToken: () => 'signed-token',
      isEnabled: (setting?: string | boolean | null) => setting === 'true',
      logAxiosError,
      ...extra,
    });
    return { handlers, logAxiosError };
  }

  it('reads the agent namespace on /query so the context is not empty', async () => {
    const httpClient = fakeRag({ 'agent-file': 'agent_a' });
    const { handlers } = setupWithRag(httpClient);
    await handlers?.processFile(agentFile);
    expect(await handlers?.createContext()).toContain('Policy excerpt');
    expect(httpClient.post.mock.calls[0][1]).toEqual({
      file_id: 'agent-file',
      query: 'what does the policy say?',
      k: 4,
      entity_id: 'agent_a',
    });
  });

  it('reads the agent namespace for the full document', async () => {
    const httpClient = fakeRag({ 'agent-file': 'agent_a' });
    const { handlers } = setupWithRag(httpClient, {}, 'true');
    await handlers?.processFile(agentFile);
    expect(await handlers?.createContext()).toContain('whole policy');
    expect(httpClient.get.mock.calls[0][1]).toMatchObject({ params: { entity_id: 'agent_a' } });
  });

  it("keeps the request unchanged for the user's own file", async () => {
    const httpClient = fakeRag({ 'file-0': req.user.id });
    const { handlers } = setupWithRag(httpClient, {}, 'true');
    await handlers?.processFile(files[0]);
    expect(await handlers?.createContext()).toContain('whole policy');
    expect(httpClient.get.mock.calls[0][1]).not.toHaveProperty('params');
  });

  it('reads the agent that holds the vectors when several are recorded', async () => {
    const httpClient = fakeRag({ 'agent-file': 'agent_b' });
    const hasEntityEmbeddings = jest.fn(
      async ({ entity_id }: { entity_id: string }) => entity_id === 'agent_b',
    );
    const { handlers } = setupWithRag(httpClient, { hasEntityEmbeddings });
    await handlers?.processFile({
      ...agentFile,
      metadata: { embeddedEntities: ['agent_a', 'agent_b'] },
    });
    expect(await handlers?.createContext()).toContain('Policy excerpt');
    expect(httpClient.post.mock.calls[0][1]).toMatchObject({ entity_id: 'agent_b' });
  });

  it('falls back to the current request when the namespace cannot be resolved', async () => {
    const httpClient = fakeRag({ 'agent-file': 'agent_a' });
    const failure = new Error('lookup failed');
    const { handlers, logAxiosError } = setupWithRag(httpClient);
    await handlers?.processFile({
      ...agentFile,
      metadata: {
        get embeddedEntities(): string[] {
          throw failure;
        },
      },
    });
    await handlers?.createContext();
    expect(httpClient.post.mock.calls[0][1]).not.toHaveProperty('entity_id');
    expect(logAxiosError).toHaveBeenCalledWith({
      message: 'Error resolving the RAG namespace of policy.pdf',
      error: failure,
    });
  });
});
