import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const composerRoot = join(__dirname, '..');
const composerModules = readdirSync(composerRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
  .map((entry) => join(composerRoot, entry.name));

const protectedModules = [
  ...composerModules,
  join(__dirname, '..', '..', 'EscalateNowButton.tsx'),
  join(__dirname, '..', '..', '..', 'Messages', 'Content', 'Parts', 'PendingSteers.tsx'),
  join(__dirname, '..', '..', '..', '..', '..', 'hooks', 'Input', 'usePaletteEntries.tsx'),
];

describe('composer semantic color guardrail', () => {
  it('keeps the composer seam free of direct palette and raw colors', () => {
    const directPalette =
      /(?:bg|text|border|ring|from|via|to|fill|stroke)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d|white\b|black\b)/;
    const rawColor = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\(/i;

    protectedModules.forEach((modulePath) => {
      const source = readFileSync(modulePath, 'utf8');

      expect(source).not.toMatch(directPalette);
      expect(source).not.toMatch(rawColor);
    });
  });
});
