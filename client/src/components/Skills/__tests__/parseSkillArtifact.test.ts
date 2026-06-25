import { parseSkillArtifact } from '../SaveSkillBanner';

const SKILL_ARTIFACT = `Here is your skill:

:::artifact{identifier="pdf-creation-skill" type="text/markdown" title="PDF Creation Skill – SKILL.md"}
\`\`\`markdown
# PDF Creation Skill
## Purpose
Generate PDFs from structured input.

\`\`\`python
def make_pdf():
    pass
\`\`\`
\`\`\`
:::

Let me know if you need changes.`;

describe('parseSkillArtifact', () => {
  it('parses a markdown skill artifact into name/description/content', () => {
    const parsed = parseSkillArtifact(SKILL_ARTIFACT);
    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe('pdf-creation-skill');
    expect(parsed?.content).toContain('# PDF Creation Skill');
    expect(parsed?.content).toContain('```python');
    expect(parsed?.content).toContain('def make_pdf():');
    expect(parsed?.content.startsWith('```markdown')).toBe(false);
    expect(parsed?.description.length).toBeGreaterThan(0);
    expect(parsed?.description.toLowerCase()).not.toContain('skill.md');
  });

  it('returns null for a non-skill markdown artifact', () => {
    const text = `:::artifact{identifier="weekly-report" type="text/markdown" title="Weekly Report"}
\`\`\`markdown
# Weekly Report
\`\`\`
:::`;
    expect(parseSkillArtifact(text)).toBeNull();
  });

  it('returns null when there is no artifact', () => {
    expect(parseSkillArtifact('Just a plain assistant reply.')).toBeNull();
  });

  it('returns null for a non-markdown artifact even if titled skill', () => {
    const text = `:::artifact{identifier="my-skill" type="application/vnd.react" title="Skill"}
\`\`\`
const x = 1;
\`\`\`
:::`;
    expect(parseSkillArtifact(text)).toBeNull();
  });
});
