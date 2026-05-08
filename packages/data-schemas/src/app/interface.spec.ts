import { getConfigDefaults } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import { loadDefaultInterface } from './interface';

describe('loadDefaultInterface', () => {
  it('preserves the configured temporary chat retention period', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        temporaryChatRetention: 24,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.temporaryChatRetention).toBe(24);
  });

  it('omits temporary chat retention when it is not explicitly configured', async () => {
    const interfaceConfig = await loadDefaultInterface({
      config: {},
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig).not.toHaveProperty('temporaryChatRetention');
  });

  it('falls back to the schema default for autoSubmitFromUrl when unset', async () => {
    const interfaceConfig = await loadDefaultInterface({
      config: {},
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.autoSubmitFromUrl).toBe(true);
  });

  it('propagates an explicit autoSubmitFromUrl: false to the loaded interface', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        autoSubmitFromUrl: false,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.autoSubmitFromUrl).toBe(false);
  });

  it('propagates an explicit autoSubmitFromUrl: true to the loaded interface', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        autoSubmitFromUrl: true,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.autoSubmitFromUrl).toBe(true);
  });
});
