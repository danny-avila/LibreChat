import fs from 'node:fs';
import v8 from 'node:v8';
import path from 'node:path';
import postcss, { AtRule, Rule } from 'postcss';
import type { ChildNode, Container, Result } from 'postcss';

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const tailwindcss = require('@tailwindcss/postcss');

type FontDeclaration = { selector: string; value: string; important: boolean };

const selectorOf = (parent: Container<ChildNode> | undefined): string => {
  if (parent instanceof Rule) {
    return parent.selector;
  }
  if (parent instanceof AtRule) {
    return `@${parent.name} ${parent.params}`;
  }
  return '';
};

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim();

const firstFamily = (value: string): string =>
  collapse(value.split(',')[0]).replace(/^['"]/, '').replace(/['"]$/, '');

/**
 * The code font is one decision: `theme.fontFamily.mono` in `tailwind.config.cjs`, which
 * Tailwind's preflight applies to `code`, `kbd`, `samp` and `pre`, and which the
 * `font-mono` utility carries.
 *
 * `style.css` used to restate that decision with `!important`. Because `!important` beats
 * specificity, one stylesheet rule outranked every `font-mono` class in the app and pinned
 * code to `Consolas, Söhne Mono, Monaco, …` — faces this repository does not ship, so code
 * rendered in Consolas on Windows and in Monaco on macOS, the latter carrying neither an
 * italic nor a bold face for the browser to use, hence synthesized ones.
 */
describe('code typography', () => {
  let fontFamilies: FontDeclaration[];

  beforeAll(async () => {
    /** Tailwind v4's compiler clones its AST with `structuredClone`, which Node has and
     *  jsdom, the environment this suite shares with the components, does not. */
    globalThis.structuredClone ??= <T>(value: T): T => v8.deserialize(v8.serialize(value));
    const file = path.join(__dirname, 'style.css');
    /** Inline sources rather than a scan of the tree, so the emitted utilities depend on
     *  the names asserted here and not on the working directory a runner happens to use. */
    const stylesheet = fs
      .readFileSync(file, 'utf8')
      .replace(
        "@import 'tailwindcss';",
        "@import 'tailwindcss' source(none);\n@source inline('font-mono font-sans');",
      );
    const compiled: Result = await postcss([tailwindcss({ base: __dirname })]).process(stylesheet, {
      from: file,
    });

    fontFamilies = [];
    compiled.root.walkDecls('font-family', (declaration) => {
      fontFamilies.push({
        selector: collapse(selectorOf(declaration.parent)),
        value: collapse(declaration.value),
        important: declaration.important === true,
      });
    });
  }, 60_000);

  const utility = (): FontDeclaration | undefined =>
    fontFamilies.find((entry) => entry.selector === '.font-mono');

  it('declares no font-family that outranks a utility class', () => {
    expect(fontFamilies.filter((entry) => entry.important)).toEqual([]);
  });

  it('gives every bare code element the same stack as the font-mono utility', () => {
    const onCodeElements = fontFamilies.filter((entry) =>
      entry.selector
        .split(',')
        .map((part) => part.trim())
        .some((selector) => selector === 'code' || selector === 'pre'),
    );

    expect(utility()?.value).toBeTruthy();
    expect(onCodeElements).not.toHaveLength(0);
    for (const entry of onCodeElements) {
      expect(entry.value).toBe(utility()?.value);
    }
  });

  it('puts a self-hosted face first, so code renders the same on every platform', () => {
    const hosted = fontFamilies
      .filter((entry) => entry.selector.startsWith('@font-face'))
      .map((entry) => firstFamily(entry.value));

    expect(hosted).toContain(firstFamily(utility()?.value ?? ''));
  });
});
