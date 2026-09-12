import { replaceArtifactContent } from './update';

const artifactText = [
  ':::artifact{identifier="example" type="text/markdown" title="Example"}',
  '```md',
  'ORIGINAL',
  '```',
  ':::',
].join('\n');

const artifact = {
  start: 0,
  end: artifactText.length,
  source: 'text' as const,
  text: artifactText,
};

describe('replaceArtifactContent', () => {
  it('normalizes blank lines before a closing code and artifact fence', () => {
    const result = replaceArtifactContent(artifactText, artifact, 'ORIGINAL', 'UPDATED\n\n');

    expect(result).toContain('UPDATED\n```\n:::');
  });

  it('handles long whitespace near-misses without backtracking', () => {
    const updated = `\n\`\`\`${' \n'.repeat(100_000)}X`;
    const result = replaceArtifactContent(artifactText, artifact, 'ORIGINAL', updated);

    expect(result).toContain(updated);
  }, 1_000);
});
