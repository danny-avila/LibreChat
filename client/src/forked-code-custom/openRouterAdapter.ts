import { useState, useEffect } from 'react';

// ───────────────────────────────────────────────────────────
//  Types
// ───────────────────────────────────────────────────────────
export interface OpenRouterResponse {
  data: OpenRouterModelData[]
}

export interface OpenRouterModelData {
  id: string
  name: string
  created: number            // Unix seconds
  context_length: number
  pricing?: { prompt: number; completion: number }
  description?: string
  developer?: string
}

// ───────────────────────────────────────────────────────────
//  Constants (tweak here, no env‑vars, no SSR guards)
// ───────────────────────────────────────────────────────────
const CACHE_DURATION_MS  = 60 * 60 * 1000;   // 1 hour
const NEW_MODEL_DAYS     = 7;                // “new” ≤ 7 days
const FETCH_TIMEOUT_MS   = 5_000;            // 5s per attempt
const MAX_FETCH_RETRIES  = 1;                // single retry

// ───────────────────────────────────────────────────────────
//  Logging (disabled in production bundles)
// ───────────────────────────────────────────────────────────
const log = (...args: unknown[]) => {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {return;}

  console.warn('[openrouter‑utils]', ...args);
};

// ───────────────────────────────────────────────────────────
//  Timeout‑aware fetch with retry
// ───────────────────────────────────────────────────────────
interface FetchOptions extends RequestInit {
  timeoutMs?: number
}

const timeoutFetch = async (url: string, opts: FetchOptions, retries = MAX_FETCH_RETRIES): Promise<Response> => {
  const { timeoutMs = FETCH_TIMEOUT_MS, ...init } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok && retries) {
      log('fetch failed, retrying – status', res.status);
      return timeoutFetch(url, opts, retries - 1);
    }
    return res;
  } catch (err) {
    if (retries) {
      log('fetch threw, retrying', err);
      return timeoutFetch(url, opts, retries - 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

// ───────────────────────────────────────────────────────────
//  In‑memory cache (browser‑only runtime)
// ───────────────────────────────────────────────────────────
let cache: Record<string, OpenRouterModelData> | null = null;
let lastFetch = 0;
let initPromise: Promise<Record<string, OpenRouterModelData>> | null = null;

// ───────────────────────────────────────────────────────────
//  Normalisation helpers
// ───────────────────────────────────────────────────────────
export const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const canonicalKey = (raw: string): string => {
  if (!raw) {return '';}
  let key = raw.split('/').pop()!;            // drop provider prefix
  key = key.replace(':', '-');                // unify separators
  key = key.replace(/-(reasoning|thinking)$/i, '');
  key = key.replace(/(-\d{2,4}){1,3}$/i, ''); // strip trailing date/build tags
  return normalize(key);
};

// ───────────────────────────────────────────────────────────
//  Fetch & cache model list
// ───────────────────────────────────────────────────────────
export const fetchOpenRouterModels = async (): Promise<Record<string, OpenRouterModelData>> => {
  const now = Date.now();
  if (cache && now - lastFetch < CACHE_DURATION_MS) {return cache;}

  try {
    const res = await timeoutFetch('https://openrouter.ai/api/v1/models', {});
    if (!res.ok) {throw new Error('status ' + res.status);}
    const { data } = await res.json() as OpenRouterResponse;

    const map: Record<string, OpenRouterModelData> = {};
    data.forEach(m => {
      map[m.id]                   = m;
      map[normalize(m.id)]        = m;
      map[canonicalKey(m.id)]     = m;
      map[m.id.split('/').pop()!] = m;
      if (m.name) {
        map[normalize(m.name)]    = m;
        map[canonicalKey(m.name)] = m;
      }
    });

    cache = map;
    lastFetch = now;
    return map;
  } catch (err) {
    log('fetchOpenRouterModels failed', err);
    return cache ?? {};
  }
};

// ───────────────────────────────────────────────────────────
//  React hook – “is this model new?”
// ───────────────────────────────────────────────────────────
export const useNewModelCheck = (modelName: string, provider?: string) => {
  const [isNew,     setIsNew]     = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [createdAt, setCreatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!modelName) {return;}

    let mounted = true;
    setIsLoading(true);

    const run = async () => {
      try {
        const models = cache || await initOpenRouterData();
        if (!Object.keys(models).length) {return;}

        const cutoff = Date.now() - NEW_MODEL_DAYS * 86_400_000;
        const keys   = new Set<string>([
          modelName,
          normalize(modelName),
          canonicalKey(modelName),
        ]);

        if (provider) {
          const prov = canonicalKey(provider);
          keys.add(`${prov}/${modelName}`);
          keys.add(`${prov}/${canonicalKey(modelName)}`);
        }

        let hit: OpenRouterModelData | undefined;
        for (const k of keys) {
          if (models[k]) { hit = models[k]; break; }
        }

        if (mounted) {
          if (hit?.created) {
            setIsNew(hit.created * 1000 > cutoff);
            setCreatedAt(hit.created);
          } else {
            setIsNew(false);
            setCreatedAt(null);
          }
        }
      } catch (err) {
        log('useNewModelCheck error', err);
      } finally {
        mounted && setIsLoading(false);
      }
    };

    run();
    return () => { mounted = false; };
  }, [modelName, provider]);

  return { isNew, isLoading, createdAt };
};

// ───────────────────────────────────────────────────────────
//  Initialize once per session
// ───────────────────────────────────────────────────────────
export const initOpenRouterData = async () => {
  if (!initPromise) {
    initPromise = fetchOpenRouterModels().catch(err => {
      log('initialisation failed', err);
      cache = {};
      throw err;
    });
  }
  return initPromise;
};
