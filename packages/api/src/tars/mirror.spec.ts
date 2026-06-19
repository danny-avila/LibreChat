jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { createTarsConversation, createTarsMessage } from './mirror';

const BASE_URL = 'http://tars.test';

const buildResponse = (status: number, body: unknown): Response =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

describe('createTarsConversation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('posts the conversation and returns the new pwc_tars id', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(buildResponse(201, { conversation: { id: 'tc-1' } }));

    const id = await createTarsConversation(
      'u1',
      { name: 'Chat', domainId: '100', modelName: 'gpt-5.5', systemInstruction: 'sys' },
      BASE_URL,
    );

    expect(id).toBe('tc-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/conversation/create_conversation`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: 'Chat',
      domain_id: '100',
      model_name: 'gpt-5.5',
      system_instruction: 'sys',
      created_by: 'u1',
    });
  });

  it('returns null when pwc_tars omits the conversation id', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(buildResponse(201, {}));
    await expect(createTarsConversation('u1', { name: 'x' }, BASE_URL)).resolves.toBeNull();
  });
});

describe('createTarsMessage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('posts query + response (so pwc_tars stores the answer)', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(buildResponse(201, {}));

    await createTarsMessage(
      'u1',
      { conversationId: 'tc-1', query: 'hi', response: 'hello', modelName: 'gpt-5.5' },
      BASE_URL,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/create_message`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      conversation_id: 'tc-1',
      query: 'hi',
      response: 'hello',
      model_name: 'gpt-5.5',
      created_by: 'u1',
    });
    expect(typeof body.message).toBe('string');
  });
});
