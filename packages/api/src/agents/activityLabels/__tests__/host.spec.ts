import type { AppConfig } from '@librechat/data-schemas';
import { resolveActivityConfig } from '../host';

const appConfig = (endpoints: Record<string, unknown>): AppConfig =>
  ({ endpoints }) as unknown as AppConfig;

describe('resolveActivityConfig', () => {
  it('is disabled when nothing is configured', () => {
    expect(resolveActivityConfig(undefined, 'openAI').enabled).toBe(false);
    expect(resolveActivityConfig(appConfig({}), 'openAI').enabled).toBe(false);
  });

  it('reads the named endpoint block', () => {
    const config = resolveActivityConfig(
      appConfig({
        openAI: {
          activity: true,
          activityModel: 'gpt-4o-mini',
          activityPrompt: 'custom',
          activityMaxPerRun: 5,
          activityCharLimit: 200,
        },
      }),
      'openAI',
    );
    expect(config).toMatchObject({
      enabled: true,
      model: 'gpt-4o-mini',
      prompt: 'custom',
      maxPerRun: 5,
      charLimit: 200,
    });
  });

  it('lets endpoints.all win over the named endpoint, like the title options', () => {
    const config = resolveActivityConfig(
      appConfig({
        all: { activity: true, activityModel: 'shared-model' },
        openAI: { activity: false, activityModel: 'ignored' },
      }),
      'openAI',
    );
    expect(config.enabled).toBe(true);
    expect(config.model).toBe('shared-model');
  });

  it('falls back to a custom endpoint config when the name is absent', () => {
    const config = resolveActivityConfig(appConfig({}), 'MyProxy', {
      activity: true,
      activityModel: 'proxy-mini',
    });
    expect(config.enabled).toBe(true);
    expect(config.model).toBe('proxy-mini');
  });

  it('treats a missing activity flag as opt-out even with other fields set', () => {
    const config = resolveActivityConfig(
      appConfig({ openAI: { activityModel: 'gpt-4o-mini' } }),
      'openAI',
    );
    expect(config.enabled).toBe(false);
    expect(config.model).toBe('gpt-4o-mini');
  });
});
