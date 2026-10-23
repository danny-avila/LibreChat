import { SystemCapabilities } from '@librechat/data-schemas';
import {
  AssistantIdValidationError,
  getAssistantErrorStatus,
  createAssistantAuthorValidator,
} from './author';

const makeRequest = () => ({
  params: {} as { id?: unknown; assistant_id?: unknown },
  body: { endpoint: 'assistants' } as { endpoint: string; assistant_id?: unknown },
  query: {} as { assistant_id?: unknown },
  user: { id: 'user-attacker', role: 'USER', tenantId: 'tenant-a' },
  config: { endpoints: { assistants: { privateAssistants: true } } },
});

describe('assistant author validation', () => {
  const getAssistant = jest.fn();
  const hasCapability = jest.fn();
  const retrieve = jest.fn();
  const openai = { beta: { assistants: { retrieve } } };
  const validateAuthor = createAssistantAuthorValidator({ getAssistant, hasCapability });

  beforeEach(() => {
    getAssistant.mockReset().mockResolvedValue(null);
    hasCapability.mockReset().mockResolvedValue(false);
    retrieve.mockReset().mockResolvedValue({ metadata: { author: 'user-victim' } });
  });

  it('rejects an omitted ID before any capability, database, or provider lookup', async () => {
    await expect(validateAuthor({ req: makeRequest(), openai })).rejects.toThrow(
      'Assistant ID is required',
    );
    expect(hasCapability).not.toHaveBeenCalled();
    expect(getAssistant).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('classifies only typed selector errors as client failures', () => {
    const error = new AssistantIdValidationError('Invalid Assistant ID');
    expect(error.code).toBe('invalid_assistant_id');
    expect(getAssistantErrorStatus(error)).toBe(400);
    expect(getAssistantErrorStatus(new Error('database unavailable'))).toBe(500);
    expect(getAssistantErrorStatus({ code: 'invalid_assistant_id' })).toBe(500);
  });

  it.each(['', ' ', 'asst victim', ['asst-victim'], { $ne: null }, 42, null])(
    'rejects a malformed ID: %p',
    async (assistantId) => {
      const req = makeRequest();
      req.body.assistant_id = assistantId;
      await expect(validateAuthor({ req, openai })).rejects.toThrow('Invalid Assistant ID');
      expect(getAssistant).not.toHaveBeenCalled();
      expect(retrieve).not.toHaveBeenCalled();
    },
  );

  it.each(['body', 'query'] as const)('rejects a conflicting %s selector', async (source) => {
    const req = makeRequest();
    req.params.assistant_id = 'asst-victim';
    req[source].assistant_id = 'asst-attacker';
    await expect(
      validateAuthor({ req, openai, overrideAssistantId: 'asst-victim' }),
    ).rejects.toThrow('Conflicting Assistant IDs');
    expect(hasCapability).not.toHaveBeenCalled();
    expect(getAssistant).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('uses the avatar route target rather than an unrelated owned assistant', async () => {
    const req = makeRequest();
    req.params.assistant_id = 'asst-victim';
    getAssistant.mockImplementation(async ({ assistantId }) =>
      assistantId === 'asst-attacker' ? {} : null,
    );
    await expect(validateAuthor({ req, openai })).rejects.toThrow(
      'Assistant is not authored by the user',
    );
    expect(getAssistant).toHaveBeenCalledWith({
      assistantId: 'asst-victim',
      user: 'user-attacker',
    });
    expect(retrieve).toHaveBeenCalledWith('asst-victim');
  });

  it.each(['route', 'body', 'query'])('supports the existing %s selector', async (source) => {
    const req = makeRequest();
    if (source === 'route') {
      req.params.id = 'asst-attacker';
    } else if (source === 'body') {
      req.body.assistant_id = 'asst-attacker';
    } else {
      req.query.assistant_id = 'asst-attacker';
    }
    getAssistant.mockResolvedValue({});
    await expect(validateAuthor({ req, openai })).resolves.toEqual({
      assistantId: 'asst-attacker',
      user: 'user-attacker',
    });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('accepts matching selectors and returns the owner-scoped mutation query', async () => {
    const req = makeRequest();
    req.params.assistant_id = 'asst-attacker';
    req.body.assistant_id = 'asst-attacker';
    req.query.assistant_id = 'asst-attacker';
    getAssistant.mockResolvedValue({});
    await expect(
      validateAuthor({ req, openai, overrideAssistantId: 'asst-attacker' }),
    ).resolves.toEqual({ assistantId: 'asst-attacker', user: 'user-attacker' });
  });

  it('preserves the provider author fallback for an exact resource', async () => {
    const req = makeRequest();
    req.params.id = 'asst-attacker';
    retrieve.mockResolvedValue({ metadata: { author: 'user-attacker' } });
    await expect(validateAuthor({ req, openai })).resolves.toEqual({
      assistantId: 'asst-attacker',
      user: 'user-attacker',
    });
  });

  it('preserves the explicit management capability bypass', async () => {
    const req = makeRequest();
    req.params.assistant_id = 'asst-victim';
    hasCapability.mockResolvedValue(true);
    await expect(validateAuthor({ req, openai })).resolves.toEqual({
      assistantId: 'asst-victim',
    });
    expect(hasCapability).toHaveBeenCalledWith(req.user, SystemCapabilities.MANAGE_ASSISTANTS);
    expect(getAssistant).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('does not grant a bypass when the capability service fails', async () => {
    const req = makeRequest();
    req.params.id = 'asst-victim';
    hasCapability.mockRejectedValue(new Error('capability service unavailable'));
    await expect(validateAuthor({ req, openai })).rejects.toThrow(
      'Assistant is not authored by the user',
    );
    expect(getAssistant).toHaveBeenCalledWith({ assistantId: 'asst-victim', user: req.user.id });
  });

  it('propagates database failures rather than falling back to provider authority', async () => {
    const req = makeRequest();
    req.params.id = 'asst-victim';
    getAssistant.mockRejectedValue(new Error('database unavailable'));
    await expect(validateAuthor({ req, openai })).rejects.toThrow('database unavailable');
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('preserves shared-assistant policy without widening the resource selector', async () => {
    const req = makeRequest();
    req.params.assistant_id = 'asst-shared';
    req.config.endpoints.assistants.privateAssistants = false;
    await expect(validateAuthor({ req, openai })).resolves.toEqual({
      assistantId: 'asst-shared',
    });
    expect(hasCapability).not.toHaveBeenCalled();
    expect(getAssistant).not.toHaveBeenCalled();
  });
});
