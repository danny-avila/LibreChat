/**
 * Tests for DragDropModal provider detection fix
 *
 * Issue: Custom endpoints (like LiteLLM) pointing to OpenAI models weren't showing
 * "Upload to Provider" because currentProvider was checked before endpointType.
 *
 * Fix (line 60): Prioritize endpointType over currentProvider
 * - Changed from: isDocumentSupportedProvider(currentProvider || endpointType)
 * - Changed to:   isDocumentSupportedProvider(endpointType || currentProvider)
 */

import { EModelEndpoint, isDocumentSupportedProvider } from 'librechat-data-provider';

describe('DragDropModal - Provider Detection', () => {
  describe('endpointType priority over currentProvider', () => {
    it('should show upload option for LiteLLM with OpenAI endpointType', () => {
      const currentProvider = 'litellm'; // NOT in documentSupportedProviders
      const endpointType = EModelEndpoint.openAI; // IS in documentSupportedProviders

      // With fix: endpointType checked first = true
      const withFix = isDocumentSupportedProvider(endpointType || currentProvider);
      expect(withFix).toBe(true);

      // Without fix: currentProvider checked first = false
      const withoutFix = isDocumentSupportedProvider(currentProvider || endpointType);
      expect(withoutFix).toBe(false);
    });

    it('should show upload option for any custom gateway with OpenAI endpointType', () => {
      const currentProvider = 'my-custom-gateway';
      const endpointType = EModelEndpoint.openAI;

      const result = isDocumentSupportedProvider(endpointType || currentProvider);
      expect(result).toBe(true);
    });

    it('should fallback to currentProvider when endpointType is undefined', () => {
      const currentProvider = EModelEndpoint.openAI;
      const endpointType = undefined;

      const result = isDocumentSupportedProvider(endpointType || currentProvider);
      expect(result).toBe(true);
    });

    it('should fallback to currentProvider when endpointType is null', () => {
      const currentProvider = EModelEndpoint.anthropic;
      const endpointType = null;

      const result = isDocumentSupportedProvider((endpointType as any) || currentProvider);
      expect(result).toBe(true);
    });

    it('should return false when neither provider supports documents', () => {
      const currentProvider = 'unsupported-provider';
      const endpointType = 'unsupported-endpoint' as any;

      const result = isDocumentSupportedProvider(endpointType || currentProvider);
      expect(result).toBe(false);
    });
  });

  describe('supported providers', () => {
    const supportedProviders = [
      { name: 'OpenAI', value: EModelEndpoint.openAI },
      { name: 'Anthropic', value: EModelEndpoint.anthropic },
      { name: 'Google', value: EModelEndpoint.google },
      { name: 'Azure OpenAI', value: EModelEndpoint.azureOpenAI },
      { name: 'Custom', value: EModelEndpoint.custom },
    ];

    supportedProviders.forEach(({ name, value }) => {
      it(`should recognize ${name} as supported`, () => {
        expect(isDocumentSupportedProvider(value)).toBe(true);
      });
    });
  });

  describe('real-world scenarios', () => {
    it('should handle LiteLLM gateway pointing to OpenAI', () => {
      const scenario = {
        currentProvider: 'litellm',
        endpointType: EModelEndpoint.openAI,
      };

      expect(isDocumentSupportedProvider(scenario.endpointType || scenario.currentProvider)).toBe(
        true,
      );
    });

    it('should handle direct OpenAI connection', () => {
      const scenario = {
        currentProvider: EModelEndpoint.openAI,
        endpointType: EModelEndpoint.openAI,
      };

      expect(isDocumentSupportedProvider(scenario.endpointType || scenario.currentProvider)).toBe(
        true,
      );
    });

    it('should handle unsupported custom endpoint without override', () => {
      const scenario = {
        currentProvider: 'my-unsupported-endpoint',
        endpointType: undefined,
      };

      expect(isDocumentSupportedProvider(scenario.endpointType || scenario.currentProvider)).toBe(
        false,
      );
    });
  });
});
