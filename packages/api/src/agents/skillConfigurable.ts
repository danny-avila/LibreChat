import { EnvVar } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';

/**
 * Augments a loadTools result with skill-specific configurable properties.
 * Loads the code API key and merges it with accessibleSkillIds and the request object.
 *
 * `manualSkillPrimedIdsByName` maps each manually-invoked skill name to
 * the `_id` of the exact doc that was primed. Skill-tool handlers consult
 * it to:
 *   1. Relax the `disable-model-invocation` gate on `read_file` for
 *      manually-primed skills (so a `disable-model-invocation: true`
 *      skill the user invoked manually can still load its
 *      `references/*` / `scripts/*` files).
 *   2. Constrain the lookup to the primed `_id` on same-name collisions,
 *      so `read_file` reads from the same doc whose body got primed
 *      (otherwise a newer same-name duplicate could shadow the
 *      resolver's pick and cause body/file mismatch within a single
 *      turn).
 * Empty/missing → no exception, the gate applies as normal and the
 * lookup uses the full ACL set.
 */
export async function enrichWithSkillConfigurable(
  result: { loadedTools: unknown[]; configurable?: Record<string, unknown> },
  req: { user?: { id?: string } },
  accessibleSkillIds: unknown[],
  loadAuthValues: (params: {
    userId: string;
    authFields: string[];
  }) => Promise<Record<string, string>>,
  /** Pre-resolved code API key. When provided, loadAuthValues is skipped. */
  preResolvedCodeApiKey?: string,
  /**
   * `{ [skillName]: skillIdString }` for skills the user manually invoked
   * this turn (`$` popover). The id pins same-name collision lookups to
   * the exact doc the resolver primed.
   */
  manualSkillPrimedIdsByName?: Record<string, string>,
): Promise<{ loadedTools: unknown[]; configurable: Record<string, unknown> }> {
  let codeApiKey: string | undefined = preResolvedCodeApiKey;
  if (!codeApiKey) {
    try {
      const authValues = await loadAuthValues({
        userId: req.user?.id ?? '',
        authFields: [EnvVar.CODE_API_KEY],
      });
      codeApiKey = authValues[EnvVar.CODE_API_KEY];
    } catch (err) {
      logger.debug(
        '[enrichWithSkillConfigurable] loadAuthValues failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }
  return {
    ...result,
    configurable: {
      ...result.configurable,
      req,
      codeApiKey,
      accessibleSkillIds,
      manualSkillPrimedIdsByName,
    },
  };
}
