/**
 * @jest-environment jsdom
 */
import { buildLoginRedirectUrl } from '../src/api-endpoints';

describe('buildLoginRedirectUrl', () => {
  let savedLocation: Location;

  beforeEach(() => {
    savedLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { pathname: '/c/abc123', search: '?model=gpt-4', hash: '#msg-5' },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: savedLocation, writable: true });
  });

  it('builds a login URL from explicit args', () => {
    const result = buildLoginRedirectUrl('/c/new', '?q=hello', '');
    expect(result).toBe('/login?redirect_to=%2Fc%2Fnew%3Fq%3Dhello');
  });

  it('encodes complex paths with query and hash', () => {
    const result = buildLoginRedirectUrl('/c/new', '?q=hello&submit=true', '#section');
    expect(result).toContain('redirect_to=');
    const encoded = result.split('redirect_to=')[1];
    expect(decodeURIComponent(encoded)).toBe('/c/new?q=hello&submit=true#section');
  });

  it('falls back to window.location when no args provided', () => {
    const result = buildLoginRedirectUrl();
    const encoded = result.split('redirect_to=')[1];
    expect(decodeURIComponent(encoded)).toBe('/c/abc123?model=gpt-4#msg-5');
  });

  it('falls back to "/" when all location parts are empty', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '', search: '', hash: '' },
      writable: true,
    });
    const result = buildLoginRedirectUrl();
    expect(result).toBe('/login?redirect_to=%2F');
  });

  it('returns plain /login when pathname is /login (prevents recursive redirect)', () => {
    const result = buildLoginRedirectUrl('/login', '?redirect_to=%2Fc%2Fnew', '');
    expect(result).toBe('/login');
  });

  it('returns plain /login when window.location is already /login', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/login', search: '?redirect_to=%2Fc%2Fabc', hash: '' },
      writable: true,
    });
    const result = buildLoginRedirectUrl();
    expect(result).toBe('/login');
  });

  it('returns plain /login for /login sub-paths', () => {
    const result = buildLoginRedirectUrl('/login/2fa', '', '');
    expect(result).toBe('/login');
  });

  it('returns plain /login for basename-prefixed /login (e.g. /librechat/login)', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/librechat/login', search: '?redirect_to=%2Fc%2Fabc', hash: '' },
      writable: true,
    });
    const result = buildLoginRedirectUrl();
    expect(result).toBe('/login');
  });

  it('returns plain /login for basename-prefixed /login sub-paths', () => {
    const result = buildLoginRedirectUrl('/librechat/login/2fa', '', '');
    expect(result).toBe('/login');
  });

  it('does NOT match paths where "login" is a substring of a segment', () => {
    const result = buildLoginRedirectUrl('/c/loginhistory', '', '');
    expect(result).toContain('redirect_to=');
    expect(decodeURIComponent(result.split('redirect_to=')[1])).toBe('/c/loginhistory');
  });
});
