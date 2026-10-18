import { getFieldMeta, labelForPath, descriptionKeyForPath } from '.';
import type * as t from '~/admin/types';
import { buildFieldMetaRegistry, resolveFieldMeta } from './registry';

const localize: t.LocalizeFn = (key) =>
  ({
    com_admin_config_field_startBalance: 'Start balance',
    com_admin_config_field_custom: 'Custom',
  })[key] ?? key;

describe('resolveFieldMeta', () => {
  const root = buildFieldMetaRegistry([
    {
      'balance.startBalance': { unit: 'credits' },
      'endpoints.custom[].models.default': { labelKey: 'default_models' },
      'mcpServers.{}.startup': { runtimeDefault: true },
      'mcpServers.github.startup': { runtimeDefault: false },
      'endpoints.custom.[].name': { width: 'M' },
    },
    { 'balance.startBalance': { labelKey: 'start' } },
  ]);

  it('resolves exact paths and merges later registries over earlier ones', () => {
    expect(resolveFieldMeta(root, 'balance.startBalance')).toEqual({
      unit: 'credits',
      labelKey: 'start',
    });
  });

  it('matches array indices against [] in either spelling', () => {
    expect(resolveFieldMeta(root, 'endpoints.custom.3.models.default')?.labelKey).toBe(
      'default_models',
    );
    expect(resolveFieldMeta(root, 'endpoints.custom.0.name')?.width).toBe('M');
  });

  it('matches record keys against {} and prefers literal segments', () => {
    expect(resolveFieldMeta(root, 'mcpServers.cloudflare.startup')?.runtimeDefault).toBe(true);
    expect(resolveFieldMeta(root, 'mcpServers.github.startup')?.runtimeDefault).toBe(false);
  });

  it('accepts schema paths with [] markers but keeps [] and {} distinct', () => {
    expect(resolveFieldMeta(root, 'endpoints.custom.[].name')?.width).toBe('M');
    expect(resolveFieldMeta(root, 'endpoints.custom.{}.name')).toBeUndefined();
  });

  it('returns undefined for unknown or partial paths', () => {
    expect(resolveFieldMeta(root, 'balance')).toBeUndefined();
    expect(resolveFieldMeta(root, 'balance.startBalance.extra')).toBeUndefined();
  });
});

describe('getFieldMeta / labelForPath', () => {
  it('resolves generic metadata and suffix-derived units', () => {
    expect(getFieldMeta('balance.startBalance')).toEqual({ unit: 'credits' });
    expect(getFieldMeta('balance.reservationTtlMs')).toEqual({ unit: 'ms' });
    expect(getFieldMeta('rateLimits.fileUploads.ipWindowInMinutes')).toEqual({
      unit: 'minutes',
      runtimeDefault: 15,
    });
    expect(getFieldMeta('mcpServers.github.chatMenu')?.runtimeDefault).toBe(true);
    expect(getFieldMeta('modelSpecs.list.2.showInMenu')?.runtimeDefault).toBe(true);
    expect(getFieldMeta('version')).toBeUndefined();
    expect(getFieldMeta('endpoints.openAI.titlePrompt')).toMatchObject({ multiline: true });
    expect(getFieldMeta('webSearch.jinaApiKey')).toEqual({ secret: true });
    expect(getFieldMeta('fileStrategy')).toEqual({ confirmChange: true });
  });

  it('flags read-only sections and permission paths', () => {
    expect(getFieldMeta('cloudfront')?.yamlOnly).toBe(true);
    expect(getFieldMeta('skillSync')?.yamlOnly).toBe(true);
    expect(getFieldMeta('filters')?.baseOnly).toBe(true);
    expect(getFieldMeta('interface.prompts')?.permission).toBe(true);
    expect(getFieldMeta('interface.schedules.use')?.permission).toBe(true);
    expect(getFieldMeta('interface.schedules')?.permission).toBeUndefined();
  });

  it('shares one description per endpoint field and labels by path', () => {
    expect(descriptionKeyForPath('endpoints.openAI.titleConvo')).toBe(
      'com_admin_config_desc_endpoint_titleConvo',
    );
    expect(descriptionKeyForPath('endpoints.custom.[].titleConvo')).toBe(
      'com_admin_config_desc_endpoint_titleConvo',
    );
    expect(descriptionKeyForPath('mcpServers.{}.startup')).toBe(
      'com_admin_config_desc_mcpServers_startup',
    );
    expect(descriptionKeyForPath('modelSpecs.list.[].preset.model')).toBe(
      'com_admin_config_desc_modelSpecs_list_preset_model',
    );
    expect(labelForPath('endpoints.custom.4.models.default', (key) => key)).toBe(
      'com_admin_config_label_models_default',
    );
  });

  it('labels a path by its last named segment', () => {
    expect(labelForPath('balance.startBalance', localize)).toBe('Start balance');
    expect(labelForPath('endpoints.custom.3', localize)).toBe('Custom');
  });

  it('falls back to the key when there is no translation', () => {
    expect(labelForPath('mcpServers.cloudflare', localize)).toBe('cloudflare');
  });
});

describe('what LibreChat does with unset switches', () => {
  it('names the runtime default of switches LibreChat reads as off or on when unset', () => {
    expect(getFieldMeta('interface.retainAgentFiles')?.runtimeDefault).toBe(false);
    expect(getFieldMeta('interface.privacyPolicy.openNewTab')?.runtimeDefault).toBe(false);
    expect(getFieldMeta('fileConfig.textFallbackWithoutTools')?.runtimeDefault).toBe(false);
    expect(getFieldMeta('mcpServers.github.oauth.skip_code_challenge_check')?.runtimeDefault).toBe(
      false,
    );
    expect(
      getFieldMeta('endpoints.agents.askUserQuestion.retainedAnswers.enabled')?.runtimeDefault,
    ).toBe(true);
    expect(
      getFieldMeta('endpoints.custom.3.customParams.paramDefinitions.0.showLabel')?.runtimeDefault,
    ).toBe(true);
  });

  it('keeps the other metadata of a path it adds a default to', () => {
    expect(getFieldMeta('speech.speechTab.speechToText')).toMatchObject({
      labelKey: 'com_admin_config_label_speechTab_speechToText',
      runtimeDefault: true,
    });
    expect(getFieldMeta('mcpServers.github.serverInstructions')).toMatchObject({
      multiline: true,
      runtimeDefault: false,
    });
    expect(getFieldMeta('modelSpecs.list.0.artifacts')?.runtimeDefault).toBe(false);
  });

  it('names the service that decides a flag LibreChat only passes on', () => {
    expect(getFieldMeta('webSearch.firecrawlOptions.blockAds')?.defaultLabelKey).toBe(
      'com_admin_config_default_firecrawl_decides',
    );
    expect(getFieldMeta('mcpServers.github.requiresOAuth')?.defaultLabelKey).toBe(
      'com_admin_config_default_auto_detect',
    );
    expect(getFieldMeta('endpoints.agents.toolApproval.enabled')?.runtimeDefault).toBeUndefined();
  });
});
