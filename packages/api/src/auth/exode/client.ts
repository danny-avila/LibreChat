import { logger } from '@librechat/data-schemas';

import { exodeMainResponseSchema } from './types';
import type { ExodeAuthConfig } from './config';
import type { ExodeExchangeInput, ExodeMainExchange } from './types';
import { ExodeExchangeError } from './types';

type Fetch = typeof fetch;

function mapUpstreamStatus(status: number): ExodeExchangeError {
  if (status === 400 || status === 401) {
    return new ExodeExchangeError('BOOTSTRAP_INVALID', 401, 'Invalid Exode bootstrap token');
  }
  if (status === 403) {
    return new ExodeExchangeError('AI_CHAT_FORBIDDEN', 403, 'Exode AI chat access is forbidden');
  }
  if (status === 429) {
    return new ExodeExchangeError('AI_CHAT_LIMIT', 429, 'Exode AI chat limit reached');
  }
  return new ExodeExchangeError('EXODE_UNAVAILABLE', 502, 'Exode authentication is unavailable');
}

export async function exchangeExodeBootstrap(
  input: ExodeExchangeInput,
  config: ExodeAuthConfig,
  fetcher: Fetch = fetch,
): Promise<ExodeMainExchange> {
  const endpoint = new URL('api/v2/auth/ai-chat/exchange', config.mainUrl).toString();
  let response: Response;

  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-service-id': config.serviceId,
        'x-service-secret': config.serviceSecret,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new ExodeExchangeError('EXODE_UNAVAILABLE', 502, 'Exode authentication is unavailable');
  }

  if (!response.ok) {
    throw mapUpstreamStatus(response.status);
  }

  let body: object;
  try {
    body = await response.json();
  } catch {
    throw new ExodeExchangeError('EXODE_UNAVAILABLE', 502, 'Invalid Exode response');
  }

  const parsed = exodeMainResponseSchema.safeParse(body);
  if (!parsed.success) {
    /**
     * Log the mismatch. The two services deploy separately, so a contract drift is a realistic
     * failure — and without this it surfaces only as a generic "chat unavailable", which is
     * indistinguishable from exode being down and hides the actual cause.
     */
    logger.error('[exodeExchange] Exode response did not match the expected contract', {
      issues: parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`),
    });

    throw new ExodeExchangeError('EXODE_UNAVAILABLE', 502, 'Invalid Exode response');
  }

  return parsed.data.payload;
}
