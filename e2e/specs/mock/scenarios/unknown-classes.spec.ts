import { expect, test } from '@playwright/test';
import { designMessages, lintStdin, messagesFor } from './lint.helpers';

/**
 * Three classes in this app rendered nothing at all — `transition-color`,
 * `pointer-cursor`, `scrollbar-hide` — because nothing could tell a typo from a
 * utility. Moving the colours into `@theme inline` made the theme readable, which
 * is what lets `no-unknown-classes` ask the installed Tailwind whether a class
 * generates CSS and lets `no-raw-colors` spot a token nobody declared. Both
 * report through the flat config, so both are asked here through a stdin probe.
 */

const MISSPELLED = [
  'export default () => <div className="transition-color bg-surfce-primary" />;',
  '',
].join('\n');

const CORRECT = [
  'export default () => <div className="transition-colors bg-surface-primary" />;',
  '',
].join('\n');

test.describe('class and token existence', () => {
  test('an unknown utility class is reported by the linter @scenario:an-unknown-utility-class-is-reported-by-the-linter', () => {
    test.setTimeout(60_000);

    const reported = designMessages(lintStdin('client/src/__probe__.tsx', MISSPELLED));

    /** The class generates no CSS, and the report says so and names the class
     *  the author meant — otherwise a typo reads as a deliberate no-op. */
    const unknown = messagesFor(reported, 'shadcn/no-unknown-classes').join('\n');
    expect(unknown).toContain('"transition-color" is not a class this project\'s Tailwind knows');
    expect(unknown).toContain('Did you mean "transition-colors"?');

    /** An undeclared colour token is the same failure wearing a colour's
     *  clothes, and it is reported against the declared token list. */
    const raw = messagesFor(reported, 'shadcn/no-raw-colors').join('\n');
    expect(raw).toContain('"bg-surfce-primary" is not a declared theme color');
    expect(raw).toContain('Did you mean "bg-surface-primary"?');

    /** The negative control: the correctly spelled neighbours are silent, so the
     *  rules are reporting these two classes rather than the shape of the probe. */
    expect(designMessages(lintStdin('client/src/__probe__.tsx', CORRECT))).toEqual([]);
  });
});
