import JSZip from 'jszip';
import { Types } from 'mongoose';

import type { ISkill, ISkillFile, CreateSkillResult } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ImportSkillDeps } from '../import';

import { createImportHandler, parseFrontmatter } from '../import';

type ImportRequest = Parameters<ReturnType<typeof createImportHandler>>[0];

interface MockResponse extends Response {
  body?: unknown;
}

interface ImportSummary {
  filesProcessed: number;
  filesSucceeded: number;
  filesFailed: number;
  errors: Array<{ path: string; status: 'ok' | 'error'; error?: string }>;
}

function mockResponse(): MockResponse {
  const res = {} as MockResponse;
  res.status = jest.fn((statusCode: number) => {
    res.statusCode = statusCode;
    return res;
  }) as MockResponse['status'];
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as MockResponse['json'];
  return res;
}

function mockImportDeps(limits?: ImportSkillDeps['limits']): ImportSkillDeps {
  const skillId = new Types.ObjectId();
  const skill = {
    _id: skillId,
    name: 'tiny-limit-skill',
    description: 'A skill used by import handler tests.',
  } as ISkill & { _id: Types.ObjectId };
  const skillFile = { _id: new Types.ObjectId() } as ISkillFile & { _id: Types.ObjectId };

  return {
    limits,
    createSkill: jest.fn(async () => ({ skill }) as unknown as CreateSkillResult),
    getSkillById: jest.fn(async () => skill),
    deleteSkill: jest.fn(async () => ({ deleted: true })),
    upsertSkillFile: jest.fn(async () => skillFile),
    saveBuffer: jest.fn(async () => ({ filepath: '/tmp/imported-file', source: 'local' })),
    grantPermission: jest.fn(async () => undefined),
  };
}

function mockZipRequest(buffer: Buffer): ImportRequest {
  return {
    user: {
      id: 'user-1',
      _id: new Types.ObjectId(),
      username: 'tester',
    },
    file: {
      originalname: 'tiny-limit-skill.skill',
      buffer,
    },
  } as unknown as ImportRequest;
}

function importSummary(body: unknown): ImportSummary {
  return (body as { _importSummary: ImportSummary })._importSummary;
}

async function zipWithAdditionalFiles(fileCount: number, fileBytes: number): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'SKILL.md',
    [
      '---',
      'name: tiny-limit-skill',
      'description: A skill used by import handler tests.',
      '---',
      '# Test skill',
    ].join('\n'),
  );
  const content = 'a'.repeat(fileBytes);
  for (let i = 0; i < fileCount; i++) {
    zip.file(`files/${i}.txt`, content);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

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

describe('createImportHandler', () => {
  it('counts rejected oversized zip entries toward the cumulative decompressed limit', async () => {
    const kib = 1024;
    const deps = mockImportDeps({
      maxZipBytes: 1024 * kib,
      maxEntries: 10,
      maxSingleFileBytes: 10 * kib,
      maxDecompressedBytes: 32 * kib,
    });
    const handler = createImportHandler(deps);
    const buffer = await zipWithAdditionalFiles(4, 11 * kib);
    const res = mockResponse();

    await handler(mockZipRequest(buffer), res);

    expect(res.status).toHaveBeenCalledWith(201);
    const summary = importSummary(res.body);
    expect(summary.filesProcessed).toBe(3);
    expect(summary.filesSucceeded).toBe(0);
    expect(summary.filesFailed).toBe(3);
    expect(summary.errors).toHaveLength(3);
  });
});
