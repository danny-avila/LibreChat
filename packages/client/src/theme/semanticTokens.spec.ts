import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const sharedComponents = [
  'AnimatedSearchInput.tsx',
  'AlertDialog.tsx',
  'Button.tsx',
  'Chip.tsx',
  'Dialog.tsx',
  'IconButton.tsx',
  'Tag.tsx',
  'Toast.tsx',
];

describe('shared component color guardrail', () => {
  it('keeps shared primitives free of direct palette utilities and raw colors', () => {
    const directPalette =
      /(?:bg|text|border|ring|from|via|to|fill|stroke)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d|white\b|black\b)/;
    const rawColor = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\(/i;

    sharedComponents.forEach((component) => {
      const source = readFileSync(join(__dirname, '..', 'components', component), 'utf8');

      expect(source).not.toMatch(directPalette);
      expect(source).not.toMatch(rawColor);
    });
  });
});
