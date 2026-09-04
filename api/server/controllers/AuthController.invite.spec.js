const mockRegisterUser = jest.fn();
const mockDeleteTokens = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: (...args) => mockLoggerError(...args),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('~/server/services/AuthService', () => ({
  ...jest.requireActual('~/server/services/AuthService'),
  registerUser: (...args) => mockRegisterUser(...args),
}));

jest.mock('~/models', () => ({
  ...jest.requireActual('~/models'),
  deleteTokens: (...args) => mockDeleteTokens(...args),
}));

const { registrationController } = require('./AuthController');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const invite = { token: 'hashed-invite', email: 'invitee@example.com' };

describe('registrationController - invite consumption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consumes the invite once the account exists', async () => {
    mockRegisterUser.mockResolvedValue({ status: 200, message: 'ok', userCreated: true });

    await registrationController({ body: {}, invite }, buildRes());

    expect(mockDeleteTokens).toHaveBeenCalledWith({ token: 'hashed-invite' });
  });

  it('leaves the invite when registration is rejected', async () => {
    /** A mistyped password confirmation is the common case; it must be retryable. */
    mockRegisterUser.mockResolvedValue({ status: 404, message: 'The passwords did not match' });

    await registrationController({ body: {}, invite }, buildRes());

    expect(mockDeleteTokens).not.toHaveBeenCalled();
  });

  it('leaves the invite when the email is already in use, despite the 200', async () => {
    /** `registerUser` returns the same 200 and message whether it created an account
     *  or found the email taken, so status alone cannot drive this decision. */
    mockRegisterUser.mockResolvedValue({ status: 200, message: 'ok' });

    await registrationController({ body: {}, invite }, buildRes());

    expect(mockDeleteTokens).not.toHaveBeenCalled();
  });

  it('does not attempt a deletion for an uninvited registration', async () => {
    mockRegisterUser.mockResolvedValue({ status: 200, message: 'ok', userCreated: true });

    await registrationController({ body: {} }, buildRes());

    expect(mockDeleteTokens).not.toHaveBeenCalled();
  });

  it('still reports success when consuming the invite fails', async () => {
    /** The account exists by this point; telling the user it did not would be worse
     *  than leaving a usable invite behind. */
    mockRegisterUser.mockResolvedValue({ status: 200, message: 'ok', userCreated: true });
    mockDeleteTokens.mockRejectedValue(new Error('mongo unavailable'));
    const res = buildRes();

    await registrationController({ body: {}, invite }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ message: 'ok' });
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('never leaks the creation signal to the client', async () => {
    mockRegisterUser.mockResolvedValue({ status: 200, message: 'ok', userCreated: true });
    const res = buildRes();

    await registrationController({ body: {}, invite }, res);

    expect(res.send).toHaveBeenCalledWith({ message: 'ok' });
  });
});
