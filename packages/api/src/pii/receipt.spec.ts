import {
  createConfirmationToken,
  consumeConfirmationToken,
} from './receipt';

const input = {
  userId: 'user-1',
  text: 'Email: alice@example.com',
  requestId: 'request-1',
};

describe('PII confirmation receipts', () => {
  beforeEach(() => {
    process.env.PII_CONFIRMATION_SECRET = 'test-only-confirmation-secret-at-least-32-characters';
    jest.useRealTimers();
  });

  afterEach(() => {
    delete process.env.PII_CONFIRMATION_SECRET;
    jest.restoreAllMocks();
  });

  it('accepts a matching action once', () => {
    const token = createConfirmationToken(input);

    expect(
      consumeConfirmationToken({ ...input, token, action: 'send_as_is' }),
    ).toBe(true);
    expect(
      consumeConfirmationToken({ ...input, token, action: 'send_as_is' }),
    ).toBe(false);
  });

  const mismatches: Array<[string, Partial<typeof input>]> = [
    ['different user', { userId: 'user-2' }],
    ['different text', { text: 'Email: bob@example.com' }],
    ['different request', { requestId: 'request-2' }],
  ];

  it.each(mismatches)('rejects a token bound to a %s', (_label: string, mismatch) => {
    const token = createConfirmationToken(input);

    expect(
      consumeConfirmationToken({
        ...input,
        ...mismatch,
        token,
        action: 'send_as_is',
      }),
    ).toBe(false);
  });

  it('rejects an expired token', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValueOnce(now).mockReturnValue(now + 120_001);
    const token = createConfirmationToken(input);

    expect(
      consumeConfirmationToken({ ...input, token, action: 'anonymize' }),
    ).toBe(false);
  });

  it('fails closed without a signing secret', () => {
    delete process.env.PII_CONFIRMATION_SECRET;
    expect(() => createConfirmationToken(input)).toThrow('signing is unavailable');
  });
});
