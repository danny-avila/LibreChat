import { meoRequestHeaders } from './request';

describe('meoRequestHeaders', () => {
  it('authenticates Meo API requests with the current app session token', () => {
    const headers = meoRequestHeaders('app-session-token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer app-session-token');
  });

  it('preserves request-specific headers', () => {
    const headers = meoRequestHeaders('app-session-token', { Accept: 'text/event-stream' });
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer app-session-token');
    expect(headers.get('Accept')).toBe('text/event-stream');
  });

  it('does not issue an unauthenticated request before the app session is ready', () => {
    expect(() => meoRequestHeaders(undefined)).toThrow('session is still loading');
  });
});
