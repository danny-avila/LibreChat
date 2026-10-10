const { safeOAuthRedirect } = require('./oauthRedirect');

describe('safeOAuthRedirect', () => {
  const clientDomain = 'https://chat.example.test';

  it('keeps a same-origin Meo deep link path and query', () => {
    expect(safeOAuthRedirect('/new?connection=credential-id&model=model-id', clientDomain)).toBe(
      '/new?connection=credential-id&model=model-id',
    );
  });

  it.each(['https://evil.example', '//evil.example/path', '/\\evil.example', '/login'])(
    'rejects unsafe redirect %s',
    (redirect) => {
      expect(safeOAuthRedirect(redirect, clientDomain)).toBeNull();
    },
  );
});
