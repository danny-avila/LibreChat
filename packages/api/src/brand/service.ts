import fs from 'fs';
import path from 'path';
import { logger } from '@librechat/data-schemas';
import { brandConfigSchema } from 'librechat-data-provider';
import type { TBrandConfig } from 'librechat-data-provider';
import { loadYaml } from '../utils';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !(value instanceof Error);
}

/** Resolve the YAML file for a brand. Prefers `<brand>.yaml`; when the files are
 * named by another convention (e.g. deployment subdomain), falls back to matching
 * the `brand:` field inside each file in the directory. */
function resolveBrandFile(brandsDir: string, brand: string): string | null {
  for (const ext of ['yaml', 'yml']) {
    const direct = path.join(brandsDir, `${brand}.${ext}`);
    if (fs.existsSync(direct)) {
      return direct;
    }
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(brandsDir);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!/\.ya?ml$/.test(entry)) {
      continue;
    }
    const candidate = path.join(brandsDir, entry);
    const parsed = loadYaml(candidate);
    if (isRecord(parsed) && parsed.brand === brand) {
      return candidate;
    }
  }

  return null;
}

/**
 * Load and validate the active brand-emulation config from `brandsDir`, selected
 * by `brandName` (defaults to `process.env.BRAND`). Returns `null` — never throws —
 * when no brand is selected, the file is missing, or validation fails.
 */
export function loadBrandConfig(
  brandsDir: string,
  brandName: string | undefined = process.env.BRAND,
): TBrandConfig | null {
  if (!brandName) {
    return null;
  }

  const filePath = resolveBrandFile(brandsDir, brandName);
  if (!filePath) {
    logger.warn(`[brand] No brand config found for BRAND="${brandName}" in ${brandsDir}`);
    return null;
  }

  const parsed = loadYaml(filePath);
  if (!isRecord(parsed)) {
    logger.warn(`[brand] Failed to load or parse brand config at ${filePath}`);
    return null;
  }

  const result = brandConfigSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn(
      `[brand] Invalid brand config at ${filePath}: ${JSON.stringify(result.error.issues)}`,
    );
    return null;
  }

  logger.info(`[brand] Loaded brand config "${result.data.brand}" from ${filePath}`);
  return result.data;
}
