import type { IAgentEventActorContextMeta, IAgentFadingTier } from '@librechat/data-schemas';

const FADING_TIER_VERSION = 1;

/** Whether a persisted value is a well-formed context-fading tier. */
export function isAgentFadingTier(value: unknown): value is IAgentFadingTier {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { v, budgetTokens, masked } = value as Partial<Record<keyof IAgentFadingTier, unknown>>;
  return (
    v === FADING_TIER_VERSION &&
    typeof budgetTokens === 'number' &&
    Number.isFinite(budgetTokens) &&
    budgetTokens > 0 &&
    typeof masked === 'boolean'
  );
}

/**
 * Returns the tier worth persisting on the response message, or undefined.
 * A tier carries information once masking has activated or the budget sits
 * below the context window; a fresh tier would only seed what the next run
 * derives on its own.
 */
export function resolvePersistableFadingTier(
  tier: unknown,
  maxContextTokens?: number,
): IAgentFadingTier | undefined {
  if (!isAgentFadingTier(tier)) {
    return undefined;
  }
  const belowWindow =
    maxContextTokens != null && maxContextTokens > 0 && tier.budgetTokens < maxContextTokens;
  if (!tier.masked && !belowWindow) {
    return undefined;
  }
  return { v: FADING_TIER_VERSION, budgetTokens: tier.budgetTokens, masked: tier.masked };
}

export type RunContextMetaParams = {
  calibrationRatio: number;
  fadingTier: unknown;
  maxContextTokens?: number;
  /** Resolved lazily: only consulted when there is something to persist. */
  getEncoding: () => string;
};

/**
 * Builds the `contextMeta` a response message persists from a finished run,
 * or undefined when neither calibration nor fading carries information.
 * A latched fading tier is persisted even at a neutral calibration ratio,
 * with the ratio recorded as 1 so the stored shape stays valid.
 */
export function resolveRunContextMeta(
  params: RunContextMetaParams,
): IAgentEventActorContextMeta | undefined {
  const { calibrationRatio } = params;
  const fading = resolvePersistableFadingTier(params.fadingTier, params.maxContextTokens);
  const calibrated = calibrationRatio > 0 && calibrationRatio !== 1;
  if (!calibrated && fading == null) {
    return undefined;
  }
  return {
    calibrationRatio: calibrationRatio > 0 ? Math.round(calibrationRatio * 1000) / 1000 : 1,
    encoding: params.getEncoding(),
    ...(fading == null ? {} : { fading }),
  };
}
