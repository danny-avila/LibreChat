const resolveConfig = require('tailwindcss/resolveConfig');
const tailwindPreset = require('../../tailwind.preset.cjs');
const packageConfig = require('../../tailwind.config.js');
const packageJson = require('../../package.json');

describe('LibreChat Tailwind preset', () => {
  it('publishes the appearance roles without removing Tailwind defaults', () => {
    const resolved = resolveConfig(packageConfig);

    expect(packageConfig.presets).toContain(tailwindPreset);
    expect(resolved.theme.fontFamily.sans).toBeDefined();
    expect(resolved.theme.fontFamily['theme-ui']).toEqual([
      'var(--theme-font-family, Inter, sans-serif)',
    ]);
    expect(resolved.theme.height['theme-control']).toBe('var(--theme-control-height, 2.25rem)');
    expect(resolved.theme.borderRadius['theme-control']).toBe(
      'var(--theme-control-radius, 0.75rem)',
    );
  });

  it('exposes the preset in the published package', () => {
    expect(packageJson.files).toContain('tailwind.preset.cjs');
    expect(packageJson.exports['./tailwind-preset']).toBe('./tailwind.preset.cjs');
  });
});
