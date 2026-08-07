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
  it('keeps shared primitives free of direct palette utilities and hex colors', () => {
    const directPalette =
      /(?:bg|text|border|ring|from|via|to)-(?:gray|red|green|blue|purple|amber|yellow|orange|pink|indigo|violet|teal|cyan|slate|zinc|neutral|stone)-\d/;
    const hexColor = /#[0-9a-f]{3,8}\b/i;

    sharedComponents.forEach((component) => {
      const source = readFileSync(join(__dirname, '..', 'components', component), 'utf8');

      expect(source).not.toMatch(directPalette);
      expect(source).not.toMatch(hexColor);
    });
  });
});
