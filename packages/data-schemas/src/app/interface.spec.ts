import { loadDefaultInterface } from './interface';
import type { TConfigDefaults, TCustomConfig } from 'librechat-data-provider';

describe('loadDefaultInterface theme pass-through', () => {
  const minimalDefaults = { interface: {} } as TConfigDefaults;

  it('includes theme in output when present in config', async () => {
    const theme = {
      palette: {
        light: { 'surface-primary': '255 255 255' },
        dark: { 'surface-primary': '26 26 46' },
      },
    };
    const config: Partial<TCustomConfig> = {
      interface: { theme },
    };

    const result = await loadDefaultInterface({ config, configDefaults: minimalDefaults });

    expect(result).toBeDefined();
    expect(result).toHaveProperty('theme');
    expect(result!.theme).toEqual(theme);
  });

  it('omits theme from output when absent from config', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {},
    };

    const result = await loadDefaultInterface({ config, configDefaults: minimalDefaults });

    expect(result).not.toHaveProperty('theme');
  });
});
