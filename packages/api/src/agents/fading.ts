import { isAgentFadingTier, AGENT_FADING_TIER_VERSION } from '@librechat/data-schemas';
import type { IAgentEventActorContextMeta, IAgentFadingTier } from '@librechat/data-schemas';

export { isAgentFadingTier };

/**
 * Normalizes the tier a run exposes for persistence, or undefined when there
 * is none. `Run.getFadingTier()` already returns only tiers that carry
 * information (masking active or a budget below the pruner's window), so the
 * host only validates the shape and strips anything else the SDK may attach.
 */
export function resolvePersistableFadingTier(tier: unknown): IAgentFadingTier | undefined {
  if (!isAgentFadingTier(tier)) {
    return undefined;
  }
  return { v: AGENT_FADING_TIER_VERSION, budgetTokens: tier.budgetTokens, masked: tier.masked };
}

export type RunContextMetaParams = {
  calibrationRatio: number;
  fadingTier: unknown;
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
  const fading = resolvePersistableFadingTier(params.fadingTier);
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
