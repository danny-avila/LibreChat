import { ProxyAgent, fetch as undiciFetch } from 'undici';

const DEFAULT_REMOTE_AUTH_FETCH_TIMEOUT_MS = 10000;

export type RemoteAuthResponse = Response & {
  release?: () => void;
  json<T = unknown>(): Promise<T>;
};
export type RemoteAuthFetch = (input: string, init?: RequestInit) => Promise<RemoteAuthResponse>;
type UndiciFetchInit = Parameters<typeof undiciFetch>[1];

function getRemoteAuthFetchTimeoutMs(): number {
  const configured = Number(process.env.REMOTE_AUTH_FETCH_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }

  return DEFAULT_REMOTE_AUTH_FETCH_TIMEOUT_MS;
}

export async function fetchRemoteAuth(
  input: string,
  init: RequestInit = {},
): Promise<RemoteAuthResponse> {
  const timeoutMs = getRemoteAuthFetchTimeoutMs();
  const controller = new AbortController();
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const release = () => {
    if (timeout) {
      clearTimeout(timeout);
    }
  };
  const options = {
    ...init,
    signal: controller.signal,
    ...(process.env.PROXY ? { dispatcher: new ProxyAgent(process.env.PROXY) } : {}),
  } as UndiciFetchInit;

  let response: Response;
  try {
    response = (await undiciFetch(input, options)) as unknown as Response;
  } catch (error) {
    release();
    throw error;
  }
  const readJson = response.json.bind(response);

  return Object.assign(response, {
    release,
    async json<T = unknown>(): Promise<T> {
      try {
        return (await readJson()) as T;
      } finally {
        release();
      }
    },
  });
}
