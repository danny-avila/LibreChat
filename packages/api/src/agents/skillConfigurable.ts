import { EnvVar } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';

/**
 * Augments a loadTools result with skill-specific configurable properties.
 * Loads the code API key and merges it with accessibleSkillIds and the request object.
 *
 * `skillPrimedIdsByName` maps each primed skill name (manual `$` or
 * always-apply) to the `_id` of the exact doc whose body was primed into
 * the turn. Skill-tool handlers consult it to:
 *   1. Relax the `disable-model-invocation` gate on `read_file` for any
 *      primed skill (so a `disable-model-invocation: true` skill whose
 *      body is in context can still load its `references/*` / `scripts/*`
 *      files). Without this, a user manually invoking — or auto-priming
 *      — a disabled skill would get a body that references files the
 *      model is forbidden to open.
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
   * `{ [skillName]: skillIdString }` for every skill primed this turn
   * (manual or always-apply). The id pins same-name collision lookups to
   * the exact doc the resolver primed and relaxes the disable-model gate.
   */
  skillPrimedIdsByName?: Record<string, string>,
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
      skillPrimedIdsByName,
    },
  };
}
