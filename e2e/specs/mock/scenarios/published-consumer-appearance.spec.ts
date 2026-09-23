import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { repoRoot, run } from './lint.helpers';

/**
 * The SPA is not the only consumer of `@librechat/client`, and three of Tailwind
 * 4's changes land on the published components rather than on this app:
 *
 *   - `button` lost its pointer cursor from preflight. The SPA restores it in
 *     its own stylesheet, so the rule has to ship with the package too.
 *   - an uncoloured `border-b` is painted with `currentColor`, so a divider
 *     drawn by a primitive follows the text ink unless the primitive names a
 *     role.
 *   - the radius scale is Tailwind's, not ours, so `rounded-sm` means whatever
 *     the current major says it means.
 *
 * The scenario builds what a consumer actually installs — the package's own
 * stylesheet and its published preset, compiled by Tailwind through the
 * package's config — and asks a browser holding nothing else what the
 * primitives' class strings render as.
 */

const PROBE_DIR = resolve(repoRoot, 'e2e/specs/.test-results/published-consumer');
const DIST_STYLESHEET = resolve(repoRoot, 'packages/client/dist/style.css');

/** The class strings below are the published primitives' own, copied from the
 *  components so the probe cannot drift away from what ships. */
const ACCORDION_ITEM = 'border-b border-border-light';
const CHECKBOX_BOX = 'h-4 w-4 shrink-0 rounded-sm border';
const SEARCH_FIELD = 'w-full bg-transparent text-sm';
const BUTTON_DISABLED = 'disabled:cursor-not-allowed';

test.describe('the published package appearance', () => {
  test('a standalone consumer keeps the package cursor, borders and radii @scenario:a-standalone-consumer-keeps-the-package-cursor-border-and-radii', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(PROBE_DIR, { recursive: true });

    /** What the consumer imports as `@librechat/client/style.css`. The mock lane
     *  and the verify runner both build the packages first; building here as
     *  well keeps the scenario runnable on its own. */
    if (!existsSync(DIST_STYLESHEET)) {
      const built = run('npm', ['run', 'build', '--prefix', resolve(repoRoot, 'packages/client')]);
      expect(built.status, `the component library did not build:\n${built.output}`).toBe(0);
    }
    const packageStylesheet = readFileSync(DIST_STYLESHEET, 'utf8');

    /** The markup the compile is allowed to see, so the utilities it emits are
     *  exactly the ones the primitives ask for. */
    const markup = `<div id="divider" class="${ACCORDION_ITEM}">divider</div>
<div id="box" class="${CHECKBOX_BOX}"></div>
<input id="search" class="${SEARCH_FIELD}" placeholder="Search" />
<button id="enabled" class="${BUTTON_DISABLED}">enabled</button>
<button id="disabled" class="${BUTTON_DISABLED}" disabled>disabled</button>`;
    const probeMarkup = join(PROBE_DIR, 'probe.html');
    writeFileSync(probeMarkup, markup);

    /** A consumer's stylesheet: Tailwind, the package's config — which is the
     *  published preset plus the semantic colors — and nothing of this app. */
    const entry = join(PROBE_DIR, 'consumer.css');
    writeFileSync(
      entry,
      [
        "@import 'tailwindcss';",
        `@config '${resolve(repoRoot, 'packages/client/tailwind.config.js')}';`,
        `@source '${probeMarkup}';`,
        '',
      ].join('\n'),
    );

    const compiler = join(PROBE_DIR, 'compile.cjs');
    const compiled = join(PROBE_DIR, 'consumer.out.css');
    writeFileSync(
      compiler,
      `const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { readFileSync, writeFileSync } = require('node:fs');
postcss([tailwind()])
  .process(readFileSync(${JSON.stringify(entry)}, 'utf8'), { from: ${JSON.stringify(entry)} })
  .then((result) => writeFileSync(${JSON.stringify(compiled)}, result.css))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
`,
    );
    const compile = run(process.execPath, [compiler]);
    expect(compile.status, `the consumer stylesheet did not compile:\n${compile.output}`).toBe(0);
    const consumerCss = readFileSync(compiled, 'utf8');

    /** The consumer's own page sets no `--radius`: the setup in the theme README
     *  never mentions one, so this is what a consumer following it gets. The
     *  border token is set because the ThemeProvider writes those as channel
     *  triplets. */
    await page.setContent(
      `<!doctype html><html><head><style>
        :root { --border-light: 10 20 30; --text-secondary: 40 50 60; }
        body { color: rgb(200 0 0); }
      </style></head><body>${markup}</body></html>`,
    );
    await page.addStyleTag({ content: consumerCss });
    await page.addStyleTag({ content: packageStylesheet });

    const read = (id: string, properties: string[]) =>
      page.evaluate(
        ([selector, names]) => {
          const element = document.getElementById(selector as string)!;
          const styles = getComputedStyle(element);
          return Object.fromEntries(
            (names as string[]).map((name) => [name, styles.getPropertyValue(name)]),
          );
        },
        [id, properties] as const,
      );

    /** Tailwind 4 renamed the radius steps — the old `sm` is `xs`, and `sm` is
     *  0.25rem — so a checkbox that says `rounded-sm` doubles its corners unless
     *  the preset states the step. 2px is what this preset produced under
     *  Tailwind 3; 4px would mean Tailwind's scale won. */
    const box = await read('box', ['border-radius']);
    expect(box['border-radius']).toBe('2px');

    /** And the step is still a variable, so a theme retunes the whole family:
     *  at `--radius: 1rem` the small step is 1rem - 0.375rem. (The SPA's own 4px
     *  comes from its config restating the family in `px`, not from here.) */
    await page.evaluate(() => document.documentElement.style.setProperty('--radius', '1rem'));
    expect((await read('box', ['border-radius']))['border-radius']).toBe('10px');
    await page.evaluate(() => document.documentElement.style.removeProperty('--radius'));

    /** The scale is in `rem` on both sides of the subtraction, so a host that
     *  moves the root font size keeps the proportions instead of collapsing the
     *  small step to a square corner. */
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '10px'));
    expect((await read('box', ['border-radius']))['border-radius']).toBe('1.25px');
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));

    /** A search field's placeholder reads as secondary text, not as the field's
     *  own ink at half strength, which is what Tailwind 4's preflight would
     *  leave a consumer with. */
    const placeholder = await page.evaluate(() => {
      const element = document.getElementById('search')!;
      return getComputedStyle(element, '::placeholder').color;
    });
    expect(placeholder).toBe('rgb(40, 50, 60)');

    /** A primitive's divider takes its colour from the role it names, not from
     *  the text ink Tailwind 4 would otherwise inherit. */
    const divider = await read('divider', ['border-bottom-color', 'color']);
    expect(divider['border-bottom-color']).toBe('rgb(10, 20, 30)');
    expect(divider['border-bottom-color']).not.toBe(divider.color);

    /** The pointer cursor ships with the package, and it ships in `base`, so a
     *  disabled button still reads as not-allowed. */
    expect((await read('enabled', ['cursor'])).cursor).toBe('pointer');
    expect((await read('disabled', ['cursor'])).cursor).toBe('not-allowed');
  });
});
