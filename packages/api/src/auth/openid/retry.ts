import { logger } from '@librechat/data-schemas';

const DEFAULT_STARTUP_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;

export type OpenIdRegistrationOptions = {
  register: () => Promise<boolean>;
  startupAttempts?: string | number;
  retryDelayMs?: string | number;
};

function parseStartupAttempts(value: string | number | undefined): number {
  const attempts = Number(value);
  if (value == null || value === '' || !Number.isFinite(attempts) || attempts < 0) {
    return DEFAULT_STARTUP_ATTEMPTS;
  }
  return Math.trunc(attempts);
}

function parseRetryDelay(value: string | number | undefined): number {
  const delay = Number(value);
  if (value == null || value === '' || !Number.isFinite(delay) || delay <= 0) {
    return DEFAULT_RETRY_DELAY_MS;
  }
  return delay;
}

async function tryRegistration(register: () => Promise<boolean>): Promise<boolean> {
  try {
    return await register();
  } catch (error) {
    logger.error('OpenID Connect strategy registration failed.', error);
    return false;
  }
}

const wait = (delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay));

export async function registerOpenIdWithRetry({
  register,
  startupAttempts,
  retryDelayMs,
}: OpenIdRegistrationOptions): Promise<void> {
  const attempts = parseStartupAttempts(startupAttempts);
  const delay = parseRetryDelay(retryDelayMs);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await tryRegistration(register)) {
      return;
    }
    if (attempt < attempts) {
      logger.warn(
        `OpenID Connect setup attempt ${attempt}/${attempts} failed. Retrying in ${delay}ms.`,
      );
      await wait(delay);
    }
  }

  logger.error('OpenID Connect configuration failed - strategy not registered.');

  const retry = async () => {
    if (await tryRegistration(register)) {
      return;
    }
    scheduleRetry();
  };
  const scheduleRetry = () => {
    logger.warn(`OpenID Connect configuration is unavailable. Retrying in ${delay}ms.`);
    const timer = setTimeout(retry, delay);
    timer.unref?.();
  };

  scheduleRetry();
}
