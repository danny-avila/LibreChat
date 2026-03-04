import { TokenExchangeMethodEnum } from 'librechat-data-provider';
import {
  getForcedTokenEndpointAuthMethod,
  resolveTokenEndpointAuthMethod,
  selectRegistrationAuthMethod,
  inferClientAuthMethod,
} from '~/mcp/oauth/methods';

describe('getForcedTokenEndpointAuthMethod', () => {
  it('returns client_secret_post for DefaultPost', () => {
    expect(getForcedTokenEndpointAuthMethod(TokenExchangeMethodEnum.DefaultPost)).toBe(
      'client_secret_post',
    );
  });

  it('returns client_secret_basic for BasicAuthHeader', () => {
    expect(getForcedTokenEndpointAuthMethod(TokenExchangeMethodEnum.BasicAuthHeader)).toBe(
      'client_secret_basic',
    );
  });

  it('returns undefined when not set', () => {
    expect(getForcedTokenEndpointAuthMethod(undefined)).toBeUndefined();
  });
});

describe('selectRegistrationAuthMethod', () => {
  it('respects server preference order: client_secret_post first', () => {
    expect(selectRegistrationAuthMethod(['client_secret_post', 'client_secret_basic'])).toBe(
      'client_secret_post',
    );
  });

  it('respects server preference order: client_secret_basic first', () => {
    expect(selectRegistrationAuthMethod(['client_secret_basic', 'client_secret_post'])).toBe(
      'client_secret_basic',
    );
  });

  it('selects none when server only advertises none', () => {
    expect(selectRegistrationAuthMethod(['none'])).toBe('none');
  });

  it('prefers credential-based method over none when server lists none first', () => {
    expect(selectRegistrationAuthMethod(['none', 'client_secret_basic'])).toBe(
      'client_secret_basic',
    );
  });

  it('prefers credential-based method over none when server lists none before post', () => {
    expect(selectRegistrationAuthMethod(['none', 'client_secret_post'])).toBe('client_secret_post');
  });

  it('falls back to server first method when none of our methods match', () => {
    expect(selectRegistrationAuthMethod(['private_key_jwt', 'tls_client_auth'])).toBe(
      'private_key_jwt',
    );
  });

  it('returns undefined when server omits token_endpoint_auth_methods_supported (RFC 8414 default preserved)', () => {
    expect(selectRegistrationAuthMethod(undefined)).toBeUndefined();
  });

  it('returns undefined for empty token_endpoint_auth_methods_supported (RFC 8414 forbids zero-element arrays)', () => {
    expect(selectRegistrationAuthMethod([])).toBeUndefined();
  });

  it('forced token_exchange_method overrides server preference', () => {
    expect(
      selectRegistrationAuthMethod(['client_secret_basic'], TokenExchangeMethodEnum.DefaultPost),
    ).toBe('client_secret_post');
  });

  it('forced BasicAuthHeader overrides server preference', () => {
    expect(
      selectRegistrationAuthMethod(
        ['client_secret_post', 'none'],
        TokenExchangeMethodEnum.BasicAuthHeader,
      ),
    ).toBe('client_secret_basic');
  });

  it('picks first supported credential method from mixed supported/unsupported list', () => {
    expect(selectRegistrationAuthMethod(['private_key_jwt', 'client_secret_post'])).toBe(
      'client_secret_post',
    );
  });

  it('skips unsupported and none to find credential method deeper in the list', () => {
    expect(selectRegistrationAuthMethod(['tls_client_auth', 'none', 'client_secret_basic'])).toBe(
      'client_secret_basic',
    );
  });
});

describe('resolveTokenEndpointAuthMethod', () => {
  it('prefers forced tokenExchangeMethod over everything', () => {
    expect(
      resolveTokenEndpointAuthMethod({
        tokenExchangeMethod: TokenExchangeMethodEnum.DefaultPost,
        tokenAuthMethods: ['client_secret_basic'],
        preferredMethod: 'client_secret_basic',
      }),
    ).toBe('client_secret_post');
  });

  it('prefers DCR registration response method when no forced override', () => {
    expect(
      resolveTokenEndpointAuthMethod({
        tokenAuthMethods: ['client_secret_basic', 'client_secret_post'],
        preferredMethod: 'client_secret_post',
      }),
    ).toBe('client_secret_post');
  });

  it('falls back to server methods when no preferred method', () => {
    expect(
      resolveTokenEndpointAuthMethod({
        tokenAuthMethods: ['client_secret_post', 'client_secret_basic'],
      }),
    ).toBe('client_secret_basic');
  });

  it('picks client_secret_post when basic is not in server methods', () => {
    expect(
      resolveTokenEndpointAuthMethod({
        tokenAuthMethods: ['client_secret_post', 'none'],
      }),
    ).toBe('client_secret_post');
  });

  it('returns undefined when no recognized methods', () => {
    expect(
      resolveTokenEndpointAuthMethod({
        tokenAuthMethods: ['private_key_jwt'],
      }),
    ).toBeUndefined();
  });

  it('defaults to client_secret_basic when no methods advertised (RFC 8414)', () => {
    expect(
      resolveTokenEndpointAuthMethod({
        tokenAuthMethods: ['client_secret_basic'],
      }),
    ).toBe('client_secret_basic');
  });

  it('ignores exotic preferredMethod and falls back to server methods', () => {
    expect(
      resolveTokenEndpointAuthMethod({
        preferredMethod: 'private_key_jwt',
        tokenAuthMethods: ['client_secret_post'],
      }),
    ).toBe('client_secret_post');
  });

  it('ignores none preferredMethod and falls back to server methods', () => {
    expect(
      resolveTokenEndpointAuthMethod({
        preferredMethod: 'none',
        tokenAuthMethods: ['client_secret_basic'],
      }),
    ).toBe('client_secret_basic');
  });

  it('returns undefined when tokenAuthMethods is empty', () => {
    expect(
      resolveTokenEndpointAuthMethod({
        tokenAuthMethods: [],
      }),
    ).toBeUndefined();
  });
});

describe('inferClientAuthMethod', () => {
  it('returns client_secret_basic when Authorization header is present', () => {
    expect(inferClientAuthMethod(true, false, false, true)).toBe('client_secret_basic');
  });

  it('returns client_secret_post when body has client_id', () => {
    expect(inferClientAuthMethod(false, true, false, true)).toBe('client_secret_post');
  });

  it('returns client_secret_post when body has client_secret', () => {
    expect(inferClientAuthMethod(false, false, true, true)).toBe('client_secret_post');
  });

  it('defaults to client_secret_basic for confidential client with no prior auth (RFC 8414)', () => {
    expect(inferClientAuthMethod(false, false, false, true)).toBe('client_secret_basic');
  });

  it('returns none for public client', () => {
    expect(inferClientAuthMethod(false, false, false, false)).toBe('none');
  });
});
