import { EnvHttpProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';

let proxyDispatcher: EnvHttpProxyAgent | undefined;
let proxyDispatcherKey: string | undefined;

export function getOpenIdProxyDispatcher(): Dispatcher | undefined {
  const proxy = process.env.PROXY;
  if (!proxy) return undefined;

  const noProxy = process.env.no_proxy ?? process.env.NO_PROXY ?? '';
  const key = `${proxy}|${noProxy}`;
  if (!proxyDispatcher || proxyDispatcherKey !== key) {
    proxyDispatcher = new EnvHttpProxyAgent({ httpProxy: proxy, httpsProxy: proxy });
    proxyDispatcherKey = key;
  }

  return proxyDispatcher;
}
