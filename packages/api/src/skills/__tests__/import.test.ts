import { parseFrontmatter } from '../import';

describe('parseFrontmatter', () => {
  it('extracts name + description from a minimal frontmatter block', () => {
    const raw = `---\nname: demo\ndescription: A demo skill.\n---\n\n# Body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'demo',
      description: 'A demo skill.',
      alwaysApply: undefined,
      invalidBooleans: [],
    });
  });

  it('extracts always-apply: true', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalways-apply: true\n---\n\n# Legal body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'legal',
      description: 'Legal rules.',
      alwaysApply: true,
      invalidBooleans: [],
    });
  });

  it('extracts always-apply: false', () => {
    const raw = `---\nname: optional\ndescription: Optional rules.\nalways-apply: false\n---\n\nOptional body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'optional',
      description: 'Optional rules.',
      alwaysApply: false,
      invalidBooleans: [],
    });
  });

  it('flags non-boolean always-apply values as invalid (no silent drop)', () => {
    const raw = `---\nname: n\ndescription: d\nalways-apply: yes\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['always-apply']);
  });

  it('does not flag always-apply when the key is absent', () => {
    const raw = `---\nname: n\ndescription: d\n---\n\nbody`;
    expect(parseFrontmatter(raw).invalidBooleans).toEqual([]);
  });

  it('does not flag always-apply when the value is an empty string (treated as absent)', () => {
    const raw = `---\nname: n\ndescription: d\nalways-apply:\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual([]);
  });

  it('is case-insensitive on the key but strict on the value', () => {
    const raw = `---\nname: n\ndescription: d\nALWAYS-APPLY: TRUE\n---\n\nbody`;
    expect(parseFrontmatter(raw).alwaysApply).toBe(true);
  });

  it('handles quoted values correctly', () => {
    const raw = `---\nname: "quoted-name"\ndescription: 'quoted desc'\nalways-apply: "true"\n---\n\nbody`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'quoted-name',
      description: 'quoted desc',
      alwaysApply: true,
      invalidBooleans: [],
    });
  });

  it('returns empty fields when no frontmatter block is present', () => {
    const raw = '# Just a body with no frontmatter';
    expect(parseFrontmatter(raw)).toEqual({
      name: '',
      description: '',
      invalidBooleans: [],
    });
  });

  it('returns empty fields when frontmatter is unterminated', () => {
    const raw = `---\nname: incomplete\n`;
    expect(parseFrontmatter(raw)).toEqual({
      name: '',
      description: '',
      invalidBooleans: [],
    });
  });

  it('ignores always-apply appearing outside the frontmatter block', () => {
    const raw = `---\nname: n\ndescription: d\n---\n\nalways-apply: true (but this is in the body)`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual([]);
  });

  it('tolerates a YAML inline comment after the boolean value', () => {
    const raw = `---\nname: commented\ndescription: demo.\nalways-apply: true # auto-prime every turn\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBe(true);
    expect(result.invalidBooleans).toEqual([]);
  });

  it('treats a comment-only always-apply value as absent (mid-edit placeholder)', () => {
    const raw = `---\nname: only-comment\ndescription: demo.\nalways-apply: # nothing here yet\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual([]);
  });

  it('flags a typo value as invalid even when followed by a comment', () => {
    const raw = `---\nname: typo\ndescription: demo.\nalways-apply: tru # typo\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['always-apply']);
  });

  it('handles a quoted boolean value followed by an inline comment', () => {
    const raw = `---\nname: quoted-comment\ndescription: demo.\nalways-apply: "true" # note\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBe(true);
    expect(result.invalidBooleans).toEqual([]);
  });

  it('handles a single-quoted false with an inline comment', () => {
    const raw = `---\nname: single-quote\ndescription: demo.\nalways-apply: 'false' # off\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBe(false);
    expect(result.invalidBooleans).toEqual([]);
  });
});
