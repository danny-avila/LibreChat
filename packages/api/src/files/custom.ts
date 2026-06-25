import * as path from 'path';
import { logger } from '@librechat/data-schemas';
import { FileSources, envVarRegex, extractEnvVariable } from 'librechat-data-provider';
import type { OCRContext, OCRStrategyFunction, OCRUploadResult } from '~/types';

/**
 * Cache resolved custom OCR handlers by absolute module path so the user-provided
 * module is only loaded and validated once per process.
 */
const handlerCache = new Map<string, OCRStrategyFunction>();

const CONFIG_HINT =
  'Set `ocr.customStrategyModule` in librechat.yaml or the `OCR_CUSTOM_STRATEGY_MODULE` environment variable to the path of your OCR module.';

function resolveModulePath(rawValue?: string): string {
  const value = (rawValue ?? '').trim();
  if (!value) {
    throw new Error(`No custom OCR strategy module configured. ${CONFIG_HINT}`);
  }

  const resolved = (envVarRegex.test(value) ? extractEnvVariable(value) : value).trim();
  if (!resolved || envVarRegex.test(resolved)) {
    throw new Error(`Custom OCR strategy module path is empty or unresolved. ${CONFIG_HINT}`);
  }

  if (resolved.startsWith('.') || path.isAbsolute(resolved)) {
    return path.resolve(process.cwd(), resolved);
  }

  return resolved;
}

function loadHandler(modulePath: string): OCRStrategyFunction {
  const cached = handlerCache.get(modulePath);
  if (cached) {
    return cached;
  }

  let loaded: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require(modulePath);
  } catch (error) {
    throw new Error(
      `Failed to load custom OCR strategy module at "${modulePath}": ${(error as Error).message}`,
    );
  }

  const candidate =
    typeof loaded === 'function'
      ? loaded
      : ((loaded as { handleFileUpload?: unknown; default?: unknown })?.handleFileUpload ??
        (loaded as { default?: unknown })?.default);

  if (typeof candidate !== 'function') {
    throw new Error(
      `Custom OCR strategy module at "${modulePath}" must export a function or an object with a \`handleFileUpload\` function.`,
    );
  }

  const handler = candidate as OCRStrategyFunction;
  handlerCache.set(modulePath, handler);
  logger.info(`[customOCR] Loaded custom OCR strategy from "${modulePath}"`);
  return handler;
}

function normalizeResult(result: Partial<OCRUploadResult>, fallbackName: string): OCRUploadResult {
  if (!result || typeof result.text !== 'string') {
    throw new Error(
      'Custom OCR strategy must resolve to an object containing a `text` string property.',
    );
  }

  const text = result.text;
  return {
    text,
    filename: typeof result.filename === 'string' ? result.filename : fallbackName,
    bytes: typeof result.bytes === 'number' ? result.bytes : Buffer.byteLength(text, 'utf8'),
    filepath: typeof result.filepath === 'string' ? result.filepath : FileSources.custom_ocr,
    images: Array.isArray(result.images) ? result.images : [],
  };
}

/**
 * Loads and invokes a user-supplied OCR module, allowing custom OCR providers to be
 * mounted into the default Docker image without forking. The module path is read from
 * `ocr.customStrategyModule` (or the `OCR_CUSTOM_STRATEGY_MODULE` environment variable)
 * and must export an async handler matching {@link OCRStrategyFunction}.
 */
export const uploadCustomOCR = async (context: OCRContext): Promise<OCRUploadResult> => {
  const modulePath = resolveModulePath(context.req.config?.ocr?.customStrategyModule);
  const handler = loadHandler(modulePath);
  const result = await handler(context);
  return normalizeResult(result, context.file.originalname);
};
