import { useMemo } from 'react';
import type { TBrandConfig, TBrandControl } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';

export interface UseBrandResult {
  /** The active brand config, or `null` when the `BRAND` env var is unset. */
  brand: TBrandConfig | null;
  /** Whether a brand is active. */
  isBranded: boolean;
  /** Resolve a single control's fields, or `null` when the brand is unset or
   * does not define the control. */
  getControl: (name: string) => TBrandControl | null;
}

/**
 * Read the active brand-emulation contract off the startup config and expose a
 * typed accessor. A no-op (`brand: null`) for non-branded deployments.
 */
export default function useBrand(): UseBrandResult {
  const { data: startupConfig } = useGetStartupConfig();
  const brand = startupConfig?.brand ?? null;

  return useMemo(
    () => ({
      brand,
      isBranded: brand != null,
      getControl: (name: string) => brand?.controls?.[name] ?? null,
    }),
    [brand],
  );
}
