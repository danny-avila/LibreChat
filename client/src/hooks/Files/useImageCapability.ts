import { useMemo } from 'react';
import { resolveImageCapability, isConfidentlyNonVision } from 'librechat-data-provider';
import type { ImageCapabilityResult } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';

export interface UseImageCapabilityParams {
  /** The active model name/id. */
  model?: string | null;
  /** The active model spec name, if a spec is selected. */
  spec?: string | null;
}

export interface UseImageCapabilityResult extends ImageCapabilityResult {
  /**
   * True only when we are confident the model cannot accept images (declared
   * `vision: false` or a known text-only model). Used to hide image-upload
   * affordances without regressing unknown-but-possibly-capable custom models,
   * which stay permissive (the backend strips images when it is sure).
   */
  confidentlyNonVision: boolean;
}

/**
 * Client-side image-capability resolution, mirroring the backend resolver so
 * the UI and the request path agree. Layers an explicit `modelSpec.vision`
 * declaration over the built-in heuristic. Endpoint-level operator knobs
 * (`visionModels`) are enforced server-side only and intentionally left
 * permissive here.
 */
export default function useImageCapability({
  model,
  spec,
}: UseImageCapabilityParams): UseImageCapabilityResult {
  const { data: startupConfig } = useGetStartupConfig();

  return useMemo(() => {
    const modelSpec = spec
      ? startupConfig?.modelSpecs?.list?.find((item) => item.name === spec)
      : undefined;

    const result = resolveImageCapability({
      model: model ?? undefined,
      vision: modelSpec?.vision,
    });

    return { ...result, confidentlyNonVision: isConfidentlyNonVision(result) };
  }, [model, spec, startupConfig?.modelSpecs?.list]);
}
