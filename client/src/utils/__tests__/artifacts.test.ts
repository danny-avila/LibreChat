import { buildSandpackOptions, sharedOptions } from '../artifacts';

describe('buildSandpackOptions', () => {
  it('omits externalResources for static template', () => {
    const options = buildSandpackOptions('static');
    expect(options?.externalResources).toEqual([]);
  });

  it('includes externalResources for react-ts template', () => {
    const options = buildSandpackOptions('react-ts');
    expect(options?.externalResources).toEqual(sharedOptions?.externalResources);
  });

  it('uses staticBundlerURL when template is static and config is provided', () => {
    const config = { staticBundlerURL: 'https://static.example.com' } as Parameters<
      typeof buildSandpackOptions
    >[1];
    const options = buildSandpackOptions('static', config);
    expect(options?.bundlerURL).toBe('https://static.example.com');
    expect(options?.externalResources).toEqual([]);
  });

  it('uses bundlerURL when template is react-ts and config is provided', () => {
    const config = { bundlerURL: 'https://bundler.example.com' } as Parameters<
      typeof buildSandpackOptions
    >[1];
    const options = buildSandpackOptions('react-ts', config);
    expect(options?.bundlerURL).toBe('https://bundler.example.com');
    expect(options?.externalResources).toEqual(sharedOptions?.externalResources);
  });

  it('returns base options without bundlerURL when no config is provided', () => {
    const options = buildSandpackOptions('react-ts');
    expect(options?.bundlerURL).toBeUndefined();
  });
});
