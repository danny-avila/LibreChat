/**
 * Keys persisted in `agent.model_parameters` (and `agent.versions[].model_parameters`)
 * that must be numeric. Any non-numeric value reaching one of these keys means a
 * corruption upstream — drop the field rather than persist a value that will fail
 * downstream payload validation (Ollama-Go and similar strict providers reject
 * type-mismatched JSON before reaching the model).
 */
export const NUMERIC_MODEL_PARAM_KEYS: ReadonlySet<string> = new Set([
  'max_tokens',
  'maxTokens',
  'max_context_tokens',
  'maxContextTokens',
  'max_output_tokens',
  'maxOutputTokens',
  'fileTokenLimit',
]);

/**
 * Sanitize an `agent.model_parameters` record before persistence.
 *
 * Coerces values for known numeric keys (cf. `NUMERIC_MODEL_PARAM_KEYS`) to a
 * positive finite number; drops the key if coercion yields `NaN`, `Infinity`,
 * or a non-positive value. Non-numeric keys are preserved verbatim.
 *
 * Defensive measure: the agent UI placeholder for these fields is the
 * localized i18n string ("System" / "Système" / "システム"), and a corruption
 * path can write that placeholder into `model_parameters` instead of leaving
 * the field undefined. Sanitizing here guarantees the stored shape always
 * matches what downstream OpenAI-compatible clients expect.
 */
export function sanitizeModelParameters(
  params: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!params) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!NUMERIC_MODEL_PARAM_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    const coerced = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(coerced) && coerced > 0) {
      out[key] = coerced;
    }
  }
  return out;
}
