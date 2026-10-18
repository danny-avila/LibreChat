import '~/admin/test/fetch';

export interface FakeReply {
  status?: number;
  body?: unknown;
}

export type FakeHandler = (request: { url: URL; init?: RequestInit }) => FakeReply;

export interface FakeCall {
  method: string;
  path: string;
  url: URL;
  init?: RequestInit;
}

/**
 * The admin API as a table of `METHOD /path` handlers, so a test drives the panel's real query and
 * request code and replaces only the network. Unrouted requests answer 404.
 */
export function createFakeBackend(routes: Record<string, FakeHandler>) {
  const calls: FakeCall[] = [];

  async function fetch(path: string, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = new URL(path, 'http://admin.test');
    calls.push({ method, path: url.pathname, url, init });
    const handler = routes[`${method} ${url.pathname}`];
    const { status = 200, body = {} } = handler
      ? handler({ url, init })
      : { status: 404, body: { error: 'Not found' } };
    return new Response(JSON.stringify(body), { status });
  }

  return { fetch, calls };
}
