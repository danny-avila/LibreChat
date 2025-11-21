import { EModelEndpoint, isDocumentSupportedProvider } from 'librechat-data-provider';

describe('DragDropModal - Provider Detection', () => {
  describe('endpointType priority over currentProvider', () => {
    it('should show upload option for LiteLLM with OpenAI endpointType', () => {
      const currentProvider = 'litellm'; // NOT in documentSupportedProviders
      const endpointType = EModelEndpoint.openAI; // IS in documentSupportedProviders

      // With fix: endpointType checked
      const withFix =
        isDocumentSupportedProvider(endpointType) || isDocumentSupportedProvider(currentProvider);
      expect(withFix).toBe(true);

      // Without fix: only currentProvider checked = false
      const withoutFix = isDocumentSupportedProvider(currentProvider || endpointType);
      expect(withoutFix).toBe(false);
    });

    it('should show upload option for any custom gateway with OpenAI endpointType', () => {
      const currentProvider = 'my-custom-gateway';
      const endpointType = EModelEndpoint.openAI;

      const result =
        isDocumentSupportedProvider(endpointType) || isDocumentSupportedProvider(currentProvider);
      expect(result).toBe(true);
    });

    it('should fallback to currentProvider when endpointType is undefined', () => {
      const currentProvider = EModelEndpoint.openAI;
      const endpointType = undefined;

      const result =
        isDocumentSupportedProvider(endpointType) || isDocumentSupportedProvider(currentProvider);
      expect(result).toBe(true);
    });

    it('should fallback to currentProvider when endpointType is null', () => {
      const currentProvider = EModelEndpoint.anthropic;
      const endpointType = null;

      const result =
        isDocumentSupportedProvider(endpointType as any) ||
        isDocumentSupportedProvider(currentProvider);
      expect(result).toBe(true);
    });

    it('should return false when neither provider supports documents', () => {
      const currentProvider = 'unsupported-provider';
      const endpointType = 'unsupported-endpoint' as any;

      const result =
        isDocumentSupportedProvider(endpointType) || isDocumentSupportedProvider(currentProvider);
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

      expect(
        isDocumentSupportedProvider(scenario.endpointType) ||
          isDocumentSupportedProvider(scenario.currentProvider),
      ).toBe(true);
    });

    it('should handle direct OpenAI connection', () => {
      const scenario = {
        currentProvider: EModelEndpoint.openAI,
        endpointType: EModelEndpoint.openAI,
      };

      expect(
        isDocumentSupportedProvider(scenario.endpointType) ||
          isDocumentSupportedProvider(scenario.currentProvider),
      ).toBe(true);
    });

    it('should handle unsupported custom endpoint without override', () => {
      const scenario = {
        currentProvider: 'my-unsupported-endpoint',
        endpointType: undefined,
      };

      expect(
        isDocumentSupportedProvider(scenario.endpointType) ||
          isDocumentSupportedProvider(scenario.currentProvider),
      ).toBe(false);
    });
    it('should handle agents endpoints with document supported providers', () => {
      const scenario = {
        currentProvider: EModelEndpoint.google,
        endpointType: EModelEndpoint.agents,
      };

      expect(
        isDocumentSupportedProvider(scenario.endpointType) ||
          isDocumentSupportedProvider(scenario.currentProvider),
      ).toBe(true);
    });
  });
});
