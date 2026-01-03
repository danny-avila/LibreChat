import { specsConfigSchema } from '../src/models';
import { EModelEndpoint } from '../src/schemas';

describe('specsConfigSchema', () => {
  const validModelSpec = {
    name: 'test-model',
    label: 'Test Model',
    preset: {
      endpoint: EModelEndpoint.openAI,
    },
  };

  describe('hideBaseModels option', () => {
    it('should default hideBaseModels to false when not provided', () => {
      const config = {
        list: [validModelSpec],
      };

      const result = specsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hideBaseModels).toBe(false);
      }
    });

    it('should accept hideBaseModels: true', () => {
      const config = {
        hideBaseModels: true,
        list: [validModelSpec],
      };

      const result = specsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hideBaseModels).toBe(true);
      }
    });

    it('should accept hideBaseModels: false', () => {
      const config = {
        hideBaseModels: false,
        list: [validModelSpec],
      };

      const result = specsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hideBaseModels).toBe(false);
      }
    });

    it('should reject hideBaseModels with non-boolean value', () => {
      const config = {
        hideBaseModels: 'yes',
        list: [validModelSpec],
      };

      const result = specsConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});
