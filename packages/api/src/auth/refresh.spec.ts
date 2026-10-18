import { buildOpenIDRefreshParams } from './refresh';

const ORIGINAL_OPENID_SCOPE = process.env.OPENID_SCOPE;
const ORIGINAL_OPENID_REFRESH_AUDIENCE = process.env.OPENID_REFRESH_AUDIENCE;

describe('buildOpenIDRefreshParams', () => {
  beforeEach(() => {
    delete process.env.OPENID_SCOPE;
    delete process.env.OPENID_REFRESH_AUDIENCE;
  });

  afterAll(() => {
    if (ORIGINAL_OPENID_SCOPE === undefined) {
      delete process.env.OPENID_SCOPE;
    } else {
      process.env.OPENID_SCOPE = ORIGINAL_OPENID_SCOPE;
    }

    if (ORIGINAL_OPENID_REFRESH_AUDIENCE === undefined) {
      delete process.env.OPENID_REFRESH_AUDIENCE;
    } else {
      process.env.OPENID_REFRESH_AUDIENCE = ORIGINAL_OPENID_REFRESH_AUDIENCE;
    }
  });

  it('returns scope-only params when OPENID_SCOPE is set', () => {
    process.env.OPENID_SCOPE = 'openid profile email';

    expect(buildOpenIDRefreshParams()).toEqual({ scope: 'openid profile email' });
  });

  it('returns scope and audience params when both refresh settings are set', () => {
    process.env.OPENID_SCOPE = 'openid profile email';
    process.env.OPENID_REFRESH_AUDIENCE = 'https://api.example.com';

    expect(buildOpenIDRefreshParams()).toEqual({
      scope: 'openid profile email',
      audience: 'https://api.example.com',
    });
  });

  it('returns audience-only params when OPENID_SCOPE is unset', () => {
    process.env.OPENID_REFRESH_AUDIENCE = 'https://api.example.com';

    expect(buildOpenIDRefreshParams()).toEqual({ audience: 'https://api.example.com' });
  });

  it('omits an empty refresh audience', () => {
    process.env.OPENID_REFRESH_AUDIENCE = '';

    expect(buildOpenIDRefreshParams()).toEqual({});
  });

  it('returns no params when scope and refresh audience are unset', () => {
    expect(buildOpenIDRefreshParams()).toEqual({});
  });
});
