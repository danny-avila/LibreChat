jest.mock('~/models', () => ({
  getRoleByName: jest.fn(),
}));

const mockFindDeniedAssistantRunTools = jest.fn();
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  findDeniedAssistantRunTools: (...args) => mockFindDeniedAssistantRunTools(...args),
}));

const mockHandleAbortError = jest.fn();
jest.mock('~/server/middleware/abortMiddleware', () => ({
  handleAbortError: (...args) => mockHandleAbortError(...args),
}));

const mockGetOpenAIClient = jest.fn();
jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: (...args) => mockGetOpenAIClient(...args),
}));

const { getRoleByName } = require('~/models');
const validateAssistant = require('./validate');

describe('validateAssistant', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {
        endpoint: 'assistants',
        assistant_id: 'asst_123',
        conversationId: 'convo_1',
        messageId: 'msg_1',
        endpointOption: { model: 'gpt-4' },
      },
      config: { endpoints: { assistants: {} } },
      user: { id: 'user_1' },
    };
    res = {};
    next = jest.fn();
  });

  it('refuses the run and never calls next when the role denies a stored native tool', async () => {
    mockFindDeniedAssistantRunTools.mockResolvedValue(['code_interpreter']);

    await validateAssistant(req, res, next);

    expect(mockHandleAbortError).toHaveBeenCalledTimes(1);
    const [resArg, reqArg, error, data] = mockHandleAbortError.mock.calls[0];
    expect(resArg).toBe(res);
    expect(reqArg).toBe(req);
    expect(error).toEqual({ message: 'validateAssistant: Assistant tool not permitted for role' });
    expect(data).toMatchObject({
      sender: 'System',
      conversationId: 'convo_1',
      parentMessageId: 'msg_1',
      error,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('checks the native-tool grant before the assistants-config early return', async () => {
    req.config = { endpoints: {} };
    mockFindDeniedAssistantRunTools.mockResolvedValue(['file_search']);

    await validateAssistant(req, res, next);

    expect(mockFindDeniedAssistantRunTools).toHaveBeenCalledTimes(1);
    expect(mockHandleAbortError).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('falls through to the assistants-config early return when no native tool is denied', async () => {
    req.config = { endpoints: {} };
    mockFindDeniedAssistantRunTools.mockResolvedValue([]);

    await validateAssistant(req, res, next);

    expect(mockFindDeniedAssistantRunTools).toHaveBeenCalledTimes(1);
    expect(mockHandleAbortError).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('preserves the supportedIds denial once no native tool is denied', async () => {
    mockFindDeniedAssistantRunTools.mockResolvedValue([]);
    req.config = { endpoints: { assistants: { supportedIds: ['asst_other'] } } };

    await validateAssistant(req, res, next);

    expect(mockHandleAbortError).toHaveBeenCalledTimes(1);
    const [, , error] = mockHandleAbortError.mock.calls[0];
    expect(error.message).toBe('validateAssistant: Assistant not supported');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when no native tool is denied and the assistant is not excluded', async () => {
    mockFindDeniedAssistantRunTools.mockResolvedValue([]);

    await validateAssistant(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockHandleAbortError).not.toHaveBeenCalled();
  });

  it('passes the request, role lookup and a lazy tool loader that reads the stored assistant tools', async () => {
    mockFindDeniedAssistantRunTools.mockResolvedValue([]);
    const assistantTools = [{ type: 'code_interpreter' }];
    const retrieveMock = jest.fn().mockResolvedValue({ tools: assistantTools });
    mockGetOpenAIClient.mockResolvedValue({
      openai: { beta: { assistants: { retrieve: retrieveMock } } },
    });

    await validateAssistant(req, res, next);

    expect(mockFindDeniedAssistantRunTools).toHaveBeenCalledTimes(1);
    const {
      req: passedReq,
      getRoleByName: passedGetRoleByName,
      getTools,
    } = mockFindDeniedAssistantRunTools.mock.calls[0][0];
    expect(passedReq).toBe(req);
    expect(passedGetRoleByName).toBe(getRoleByName);
    expect(retrieveMock).not.toHaveBeenCalled();

    await expect(getTools()).resolves.toEqual(assistantTools);
    expect(mockGetOpenAIClient).toHaveBeenCalledWith(
      expect.objectContaining({ req, res, endpointOption: req.body.endpointOption }),
    );
    expect(retrieveMock).toHaveBeenCalledWith('asst_123');
  });
});
