import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const inputRoot = join(__dirname, '..');
const source = (file: string): string => readFileSync(join(inputRoot, file), 'utf8');

const themedControls = [
  ['SendButton.tsx', ['size-theme-control', 'rounded-theme-control-round', 'p-theme-compact']],
  ['StopButton.tsx', ['size-theme-control', 'rounded-theme-control-round', 'p-theme-compact']],
  [
    'DuringRunSendButton.tsx',
    ['size-theme-control', 'rounded-theme-control-round', 'p-theme-compact'],
  ],
  ['InterruptSteerButton.tsx', ['size-theme-control', 'rounded-theme-control-round']],
  ['AudioRecorder.tsx', ['size="theme"', 'shape="theme"']],
  ['MCPSelect.tsx', ['h-theme-control', 'rounded-theme-control-round']],
  ['TokenUsage/index.tsx', ['size-theme-control', 'rounded-theme-control-round']],
  ['Files/AttachFile.tsx', ['size-theme-control', 'rounded-theme-control-round']],
  ['Files/AttachFileMenu.tsx', ['size-theme-control', 'rounded-theme-control-round']],
  ['ToolsDropdown.tsx', ['size-theme-control', 'rounded-theme-control-round']],
] as const;

describe('Composer appearance tokens', () => {
  it.each(themedControls)('%s uses shared control geometry', (file, expectedTokens) => {
    const contents = source(file);

    expectedTokens.forEach((token) => expect(contents).toContain(token));
  });
});
