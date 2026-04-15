import { logger } from '@librechat/data-schemas';

/**
 * Augments a loadTools result with skill-specific configurable properties.
 * Loads the code API key and merges it with accessibleSkillIds and the request object.
 */
export async function enrichWithSkillConfigurable(
  result: { loadedTools: unknown[]; configurable?: Record<string, unknown> },
  req: { user?: { id?: string } },
  accessibleSkillIds: unknown[],
  loadAuthValues: (params: {
    userId: string;
    authFields: string[];
  }) => Promise<Record<string, string>>,
): Promise<{ loadedTools: unknown[]; configurable: Record<string, unknown> }> {
  let codeApiKey: string | undefined;
  try {
    const authValues = await loadAuthValues({
      userId: req.user?.id ?? '',
      authFields: ['LIBRECHAT_CODE_API_KEY'],
    });
    codeApiKey = authValues.LIBRECHAT_CODE_API_KEY;
  } catch (err) {
    logger.debug(
      '[enrichWithSkillConfigurable] loadAuthValues failed:',
      err instanceof Error ? err.message : err,
    );
  }
  return {
    ...result,
    configurable: {
      ...result.configurable,
      req,
      codeApiKey,
      accessibleSkillIds,
    },
  };
}
