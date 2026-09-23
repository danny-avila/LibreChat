const v8 = require('v8');

/** Tailwind's compiler clones its theme with `structuredClone`, which jsdom does not provide.
 *  V8 serialization is the same structured-clone algorithm Node's global uses. */
globalThis.structuredClone ??= (value) => v8.deserialize(v8.serialize(value));

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { compile } = require('tailwindcss');
const tailwindPreset = require('../../tailwind.preset.cjs');
const packageConfig = require('../../tailwind.config.js');
const packageJson = require('../../package.json');
const { defaultAppearance, themeAppearanceProperties } = require('./registry');

const packageRoot = path.resolve(__dirname, '../..');

/**
 * Compiles the library's theme entry, the same file an app or tool loads, and returns the CSS
 * for `candidates`. Tailwind v4 has no `resolveConfig`, and a resolved config would only prove
 * the preset's objects merged; what a consumer actually depends on is that the appearance
 * utilities generate and fall back to the registry's defaults.
 */
async function generate(candidates) {
  const compiler = await compile(`@import './src/theme/theme.css';\n`, {
    base: packageRoot,
    async loadModule(id, base) {
      const modulePath = id.startsWith('.') ? path.resolve(base, id) : require.resolve(id);
      const loaded = require(modulePath);
      return { base: path.dirname(modulePath), module: loaded.default ?? loaded, path: modulePath };
    },
    async loadStylesheet(id, base) {
      /** Resolved through package.json: jest's moduleNameMapper turns a `.css` request into a
       *  style stub, which would hand Tailwind JavaScript to parse. */
      const stylesheet =
        id === 'tailwindcss'
          ? path.join(path.dirname(require.resolve('tailwindcss/package.json')), 'index.css')
          : path.resolve(base, id);
      return {
        base: path.dirname(stylesheet),
        content: await fsp.readFile(stylesheet, 'utf8'),
        path: stylesheet,
      };
    },
  });

  return compiler.build(candidates);
}

describe('LibreChat Tailwind preset', () => {
  it('generates every component animation and its keyframes together', async () => {
    const names = ['loading-dot', 'accordion-down', 'accordion-up', 'caret-blink'];
    const css = await generate(names.map((name) => `animate-${name}`));

    for (const name of names) {
      expect(css).toContain(`.animate-${name}`);
      expect(css).toContain(`@keyframes ${name}`);
    }
  });

  it('publishes the appearance roles without removing Tailwind defaults', async () => {
    expect(packageConfig.presets).toContain(tailwindPreset);

    const roles = [
      ['font-theme-ui', '--theme-font-family', defaultAppearance.fontFamily],
      ['h-theme-control', '--theme-control-height', defaultAppearance.controlHeight],
      ['p-theme-compact', '--theme-space-compact', defaultAppearance.spaceCompact],
      ['p-theme-normal', '--theme-space-normal', defaultAppearance.spaceNormal],
      ['p-theme-control-touch', '--theme-control-height', defaultAppearance.controlHeight],
      ['rounded-theme-control', '--theme-control-radius', defaultAppearance.controlRadius],
      [
        'rounded-theme-control-round',
        '--theme-round-control-radius',
        defaultAppearance.roundControlRadius,
      ],
      ['rounded-theme-surface', '--theme-surface-radius', defaultAppearance.surfaceRadius],
      [
        'rounded-theme-surface-lg',
        '--theme-large-surface-radius',
        defaultAppearance.largeSurfaceRadius,
      ],
      ['shadow-theme-surface', '--theme-elevation-surface', defaultAppearance.elevationSurface],
      ['duration-theme-fast', '--theme-motion-fast', defaultAppearance.motionFast],
      ['duration-theme-normal', '--theme-motion-normal', defaultAppearance.motionNormal],
    ];

    const css = await generate([...roles.map(([candidate]) => candidate), 'font-sans', 'p-4']);

    roles.forEach(([candidate, property, fallback]) => {
      expect(css).toContain(`.${candidate}`);
      expect(css).toContain(`var(${property}, ${fallback})`);
    });

    /** The tap-target floor is the role's reason to exist, so the floor itself is asserted
     *  rather than only the control-height variable it is built from. */
    expect(css).toContain(
      `max(var(--theme-control-height, ${defaultAppearance.controlHeight}), 2.75rem)`,
    );

    /** The preset extends the default theme rather than replacing it. */
    expect(css).toContain('.font-sans');
    expect(css).toContain('.p-4');
  });

  it('keeps the high-contrast variant keyed to the resolved app mode', async () => {
    const css = await generate(['high-contrast:bg-surface-primary']);

    expect(css).toContain('html.high-contrast');
  });

  /** The tap-target floor is half CSS and half variant: a spacing key nothing can
   *  reach is not a floor, so the registration is asserted, not just the value. */
  it('registers the appearance variants the utilities are written against', () => {
    const variants = {};
    /** The preset also carries `tailwindcss-animate`, which Tailwind hands an
     *  object rather than a bare function; the variants live in the plugin this
     *  file owns, so only the callable entries are invoked here. */
    tailwindPreset.plugins
      .filter((plugin) => typeof plugin === 'function')
      .forEach((plugin) =>
        plugin({
          addVariant: (name, value) => {
            variants[name] = value;
          },
        }),
      );

    /** `any-pointer`, not `pointer`: the floor has to apply to a 2-in-1's
     *  touchscreen while its trackpad is the primary device and reports `fine`. */
    expect(variants.touch).toBe('@media (any-pointer: coarse)');
    /** Its inverse gates hidden-until-hover states, so a 2-in-1's finger user —
     *  whose trackpad makes `(hover: hover)` true — never loses the control. */
    expect(variants['no-touch']).toBe('@media not all and (any-pointer: coarse)');
    expect(variants['high-contrast']).toBe('html.high-contrast &');
  });

  it('exposes the preset in the published package', () => {
    expect(packageJson.files).toContain('tailwind.preset.cjs');
    expect(packageJson.exports['./tailwind-preset']).toBe('./tailwind.preset.cjs');
  });

  it('keeps application CSS defaults aligned with the appearance registry', () => {
    const applicationStyles = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/style.css'),
      'utf8',
    );

    Object.entries(themeAppearanceProperties).forEach(([key, property]) => {
      expect(applicationStyles).toContain(`${property}: ${defaultAppearance[key]};`);
    });
  });
});
