import { isOpenIDSessionMissingError } from './errors';

describe('isOpenIDSessionMissingError', () => {
  it('recognizes the express-session missing record error', () => {
    expect(isOpenIDSessionMissingError(new Error('failed to load session'))).toBe(true);
  });

  it.each([
    new Error('connection unavailable'),
    new Error('session unavailable'),
    null,
    'failed to load session',
  ])('does not interpret other failures as permission to clear credentials: %s', (error) =>
    expect(isOpenIDSessionMissingError(error)).toBe(false),
  );
});
