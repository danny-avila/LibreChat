import { resolveImageCapability, isConfidentlyNonVision } from 'librechat-data-provider';
import type { TEndpoint, TModelSpec, ImageCapabilityResult } from 'librechat-data-provider';

export interface GetImageCapabilityParams {
  /** The model name/id being evaluated. */
  model?: string;
  /** Resolved endpoint config (custom endpoint), source of operator vision aliases. */
  endpointConfig?: Partial<TEndpoint>;
  /** Active model spec, source of an explicit `vision` declaration. */
  modelSpec?: Pick<TModelSpec, 'vision'>;
  /** Explicit declaration from a caller (e.g. an agent-level vision toggle). */
  vision?: boolean;
  /** Provider/endpoint-level default when no per-model signal exists. */
  endpointCapable?: boolean;
  /** When provided, a model absent from this list is treated as unusable. */
  availableModels?: string[];
}

/**
 * Backend entry point for image-capability resolution. Collects the explicit
 * signals available on the server (model spec, endpoint config, caller
 * overrides) and delegates the decision to the shared `resolveImageCapability`
 * so frontend and backend stay in agreement.
 *
 * Precedence for the explicit declaration: caller `vision` → `modelSpec.vision`.
 * The endpoint's configured `visionModels` are forwarded as heuristic aliases.
 */
export function getImageCapability({
  model,
  endpointConfig,
  modelSpec,
  vision,
  endpointCapable,
  availableModels,
}: GetImageCapabilityParams): ImageCapabilityResult {
  const declared = typeof vision === 'boolean' ? vision : modelSpec?.vision;

  return resolveImageCapability({
    model,
    vision: declared,
    endpointCapable,
    additionalModels: endpointConfig?.visionModels,
    availableModels,
  });
}

/**
 * Whether image content should be stripped before sending to the model.
 *
 * Only strips on a *confident* negative — an explicit declaration, a known
 * text-only model, an unavailable model, or an endpoint-level default. When no
 * signal exists (`none`), returns false so unrecognized-but-possibly-capable
 * models keep receiving images, preserving legacy behavior and avoiding
 * regressions for custom endpoints the heuristic doesn't know about.
 */
export function shouldStripImages(result: ImageCapabilityResult): boolean {
  return isConfidentlyNonVision(result);
}
