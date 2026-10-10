export function meoRequestHeaders(token: string | undefined, headers: HeadersInit = {}): Headers {
  if (!token) throw new Error('Your Meo AI session is still loading. Try again in a moment.');
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
  requestHeaders.set('Authorization', `Bearer ${token}`);
  return requestHeaders;
}
