import { EModelEndpoint } from 'librechat-data-provider';
import {
  createProviderToolName,
  resolveToolNameMaxLength,
  isProviderToolNameCompatible,
} from './names';

describe('names.ts', () => {
  describe('resolveToolNameMaxLength', () => {
    it('uses the provider default when config is missing', () => {
      expect(resolveToolNameMaxLength({ provider: EModelEndpoint.openAI })).toBe(64);
      expect(resolveToolNameMaxLength({ provider: EModelEndpoint.anthropic })).toBe(64);
      expect(resolveToolNameMaxLength({ provider: EModelEndpoint.google })).toBe(64);
      expect(resolveToolNameMaxLength({ provider: EModelEndpoint.bedrock })).toBe(64);
    });

    it('uses endpoints.all as the global override', () => {
      const appConfig = {
        endpoints: {
          all: { toolNameMaxLength: 80 },
        },
      };

      expect(resolveToolNameMaxLength({ appConfig, provider: EModelEndpoint.openAI })).toBe(80);
    });

    it('uses provider config before endpoints.all', () => {
      const appConfig = {
        endpoints: {
          all: { toolNameMaxLength: 80 },
          [EModelEndpoint.openAI]: { toolNameMaxLength: 48 },
        },
      };

      expect(resolveToolNameMaxLength({ appConfig, provider: EModelEndpoint.openAI })).toBe(48);
    });

    it('uses matching custom endpoint config before endpoints.all', () => {
      const appConfig = {
        endpoints: {
          all: { toolNameMaxLength: 80 },
          [EModelEndpoint.custom]: [{ name: 'OpenRouter', toolNameMaxLength: 52 }],
        },
      };

      expect(resolveToolNameMaxLength({ appConfig, provider: 'openrouter' })).toBe(52);
    });
  });

  describe('createProviderToolName', () => {
    it('keeps compatible canonical names unchanged', () => {
      const canonicalName = 'list_items_mcp_server';
      expect(createProviderToolName({ canonicalName, maxLength: 64 })).toBe(canonicalName);
    });

    it('aliases long canonical names within the configured limit', () => {
      const canonicalName =
        'search_records_with_a_very_long_raw_name_mcp_server_with_a_very_long_name';
      const alias = createProviderToolName({ canonicalName, maxLength: 64 });

      expect(alias).not.toBe(canonicalName);
      expect(alias.length).toBeLessThanOrEqual(64);
      expect(isProviderToolNameCompatible(alias, 64)).toBe(true);
    });

    it('aliases provider-incompatible canonical names', () => {
      const canonicalName = 'search.records_mcp_server';
      const alias = createProviderToolName({ canonicalName, maxLength: 64 });

      expect(alias).not.toBe(canonicalName);
      expect(isProviderToolNameCompatible(alias, 64)).toBe(true);
    });
  });
});
