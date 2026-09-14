import { summarizeVerifiedWrite } from './persist';

describe('summarizeVerifiedWrite', () => {
  it('reports success when the sandbox result includes the written file', () => {
    const verified = summarizeVerifiedWrite({
      action: 'Created',
      path: '/mnt/data/probe.txt',
      content: 'hello',
      evidence: {
        kind: 'named-files',
        files: [{ name: 'probe.txt' }],
      },
    });

    expect(verified).toEqual({
      ok: true,
      summary: 'Created /mnt/data/probe.txt (5 chars).',
    });
  });

  it('matches a sandbox file listed by full path', () => {
    const verified = summarizeVerifiedWrite({
      action: 'Updated',
      path: '/mnt/data/dir/notes.md',
      content: 'hi',
      evidence: {
        kind: 'named-files',
        files: [{ name: '/mnt/data/dir/notes.md' }],
      },
    });

    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.summary).toBe('Updated /mnt/data/dir/notes.md (2 chars).');
    }
  });

  it('reports failure when the sandbox result omits the written file', () => {
    const verified = summarizeVerifiedWrite({
      action: 'Created',
      path: '/mnt/data/probe.txt',
      content: 'hello',
      evidence: { kind: 'named-files', files: [] },
    });

    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.message).toContain('Write of "/mnt/data/probe.txt" did not persist');
      expect(verified.message).toContain('sandbox result did not include that file');
      expect(verified.message).toContain('not available to later calls');
      expect(verified.message).not.toContain('Created');
    }
  });

  it('reports failure when sandbox files are missing entirely', () => {
    const verified = summarizeVerifiedWrite({
      action: 'Created',
      path: '/mnt/data/probe.txt',
      content: 'hello',
      evidence: { kind: 'named-files' },
    });

    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.message).toContain('did not persist');
    }
  });

  it('reports failure when sandbox files only name a different path', () => {
    const verified = summarizeVerifiedWrite({
      action: 'Created',
      path: '/mnt/data/probe.txt',
      content: 'hello',
      evidence: {
        kind: 'named-files',
        files: [{ name: 'other.txt' }],
      },
    });

    expect(verified.ok).toBe(false);
  });

  it('reports success when a stored body is present', () => {
    const verified = summarizeVerifiedWrite({
      action: 'Created',
      path: 'skills/demo/SKILL.md',
      content: '# Demo\n',
      evidence: { kind: 'body', body: '# Demo\n' },
    });

    expect(verified).toEqual({
      ok: true,
      summary: 'Created skills/demo/SKILL.md (7 chars).',
    });
  });

  it('reports failure when the stored body is missing', () => {
    const verified = summarizeVerifiedWrite({
      action: 'Updated',
      path: 'skills/demo/SKILL.md',
      content: '# Demo\n',
      evidence: { kind: 'body' },
    });

    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.message).toContain('stored file body was missing');
      expect(verified.message).not.toContain('Updated skills/demo/SKILL.md (7 chars)');
    }
  });

  it('reports failure when a non-empty write stored an empty body', () => {
    const verified = summarizeVerifiedWrite({
      action: 'Created',
      path: 'skills/demo/SKILL.md',
      content: '# Demo\n',
      evidence: { kind: 'body', body: '' },
    });

    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.message).toContain('stored file body was empty');
    }
  });

  it('reports success when persisted bytes match the written content', () => {
    const content = 'export const ok = 1;';
    const verified = summarizeVerifiedWrite({
      action: 'Created',
      path: 'workspace/src/new.ts',
      content,
      evidence: { kind: 'bytes', bytes: Buffer.byteLength(content, 'utf8') },
    });

    expect(verified).toEqual({
      ok: true,
      summary: 'Created workspace/src/new.ts (20 chars).',
    });
  });

  it('reports failure when persisted bytes do not match', () => {
    const verified = summarizeVerifiedWrite({
      action: 'Created',
      path: 'workspace/src/new.ts',
      content: 'export const ok = 1;',
      evidence: { kind: 'bytes', bytes: 0 },
    });

    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.message).toContain('expected 20 bytes, got 0');
      expect(verified.message).not.toContain('Created workspace');
    }
  });

  it('reports failure when the write returned no size', () => {
    const verified = summarizeVerifiedWrite({
      action: 'Updated',
      path: 'skills/demo/references/a.md',
      content: 'reference text',
      evidence: { kind: 'bytes' },
    });

    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.message).toContain('the write returned no size');
    }
  });
});
