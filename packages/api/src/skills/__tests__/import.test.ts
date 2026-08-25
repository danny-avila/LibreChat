import JSZip from 'jszip';
import { Types } from 'mongoose';
import { FileSources } from 'librechat-data-provider';

import type { ISkill, ISkillFile, CreateSkillResult } from '@librechat/data-schemas';
import type { FiltersConfig } from 'librechat-data-provider';
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

function mockAppConfig(filters: FiltersConfig): NonNullable<ImportRequest['config']> {
  return {
    config: {},
    fileStrategy: FileSources.local,
    imageOutputType: 'webp',
    filters,
  };
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

function mockZipRequest(buffer: Buffer, config?: ImportRequest['config']): ImportRequest {
  return {
    config,
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

function mockMarkdownRequest(
  content: string,
  originalname = 'bad-frontmatter.md',
  config?: ImportRequest['config'],
): ImportRequest {
  return {
    config,
    user: {
      id: 'user-1',
      _id: new Types.ObjectId(),
      username: 'tester',
    },
    file: {
      originalname,
      buffer: Buffer.from(content),
    },
  } as unknown as ImportRequest;
}

function deeplyNestedFrontmatterMarkdown(marker: string): string {
  const nestedFrontmatter = Array.from(
    { length: 80 },
    (_, index) => `${'  '.repeat(index + 1)}level_${index}:`,
  );
  nestedFrontmatter.push(`${'  '.repeat(81)}value: ${marker}`);
  return [
    '---',
    'name: scoped-skill',
    'description: A field-scoped import regression.',
    'metadata:',
    ...nestedFrontmatter,
    '---',
    'Safe instructions.',
  ].join('\n');
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

async function zipWithSkillMarkdown(skillMarkdown: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('SKILL.md', skillMarkdown);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function spyOnZipEntryStreams() {
  const zip = new JSZip();
  zip.file('sample.txt', 'sample');
  const entry = zip.file('sample.txt');
  if (entry == null) {
    throw new Error('Failed to create sample ZIP entry');
  }
  return jest.spyOn(Object.getPrototypeOf(entry), 'nodeStream');
}

function forgeSkillMarkdownDeclaredSize(buffer: Buffer, declaredSize: number): Buffer {
  const forged = Buffer.from(buffer);
  for (let offset = 0; offset <= forged.length - 30; offset++) {
    const signature = forged.readUInt32LE(offset);
    let nameLengthOffset;
    let extraLengthOffset;
    let uncompressedSizeOffset;
    let headerLength;
    if (signature === 0x04034b50) {
      nameLengthOffset = 26;
      extraLengthOffset = 28;
      uncompressedSizeOffset = 22;
      headerLength = 30;
    } else if (signature === 0x02014b50) {
      nameLengthOffset = 28;
      extraLengthOffset = 30;
      uncompressedSizeOffset = 24;
      headerLength = 46;
    } else {
      continue;
    }
    const nameLength = forged.readUInt16LE(offset + nameLengthOffset);
    const extraLength = forged.readUInt16LE(offset + extraLengthOffset);
    const nameStart = offset + headerLength;
    const name = forged.subarray(nameStart, nameStart + nameLength).toString('utf8');
    if (name === 'SKILL.md') {
      forged.writeUInt32LE(declaredSize, offset + uncompressedSizeOffset);
    }
    offset = nameStart + nameLength + extraLength - 1;
  }
  return forged;
}

/** The reporter's repro from #14208: all three invocation-mode flags off-default. */
const INVOCATION_MODE_SKILL_MD = [
  '---',
  'name: test-skill',
  'description: A skill that restricts its invocation channels.',
  'always-apply: true',
  'user-invocable: false',
  'disable-model-invocation: true',
  '---',
  'Test body.',
].join('\n');

describe('parseFrontmatter', () => {
  it('extracts name + description from a minimal frontmatter block', () => {
    const raw = `---\nname: demo\ndescription: A demo skill.\n---\n\n# Body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'demo',
      description: 'A demo skill.',
      alwaysApply: undefined,
      frontmatter: {},
      invalidBooleans: [],
    });
  });

  it('coerces non-string scalar name and description to strings', () => {
    const raw = `---\nname: 123\ndescription: 2024\n---\n\n# Body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: '123',
      description: '2024',
      alwaysApply: undefined,
      frontmatter: {},
      invalidBooleans: [],
    });
  });

  it('extracts always-apply: true', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalways-apply: true\n---\n\n# Legal body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'legal',
      description: 'Legal rules.',
      alwaysApply: true,
      frontmatter: { 'always-apply': true },
      invalidBooleans: [],
    });
  });

  it('extracts always-apply: false', () => {
    const raw = `---\nname: optional\ndescription: Optional rules.\nalways-apply: false\n---\n\nOptional body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'optional',
      description: 'Optional rules.',
      alwaysApply: false,
      frontmatter: { 'always-apply': false },
      invalidBooleans: [],
    });
  });

  it('extracts alwaysApply: true and canonicalizes the alias in the bag', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalwaysApply: true\n---\n\n# Legal body`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'legal',
      description: 'Legal rules.',
      alwaysApply: true,
      frontmatter: { 'always-apply': true },
      invalidBooleans: [],
    });
  });

  it('lets always-apply win when both spellings are present', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalways-apply: false\nalwaysApply: true\n---\n\n# Legal body`;
    expect(parseFrontmatter(raw).alwaysApply).toBe(false);
  });

  it('ignores invalid alwaysApply alias when canonical always-apply is valid', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalways-apply: true\nalwaysApply: yes\n---\n\n# Legal body`;
    const result = parseFrontmatter(raw);

    expect(result.alwaysApply).toBe(true);
    expect(result.invalidBooleans).toEqual([]);
  });

  it('ignores invalid alwaysApply alias before a valid canonical always-apply', () => {
    const raw = `---\nname: legal\ndescription: Legal rules.\nalwaysApply: yes\nalways-apply: false\n---\n\n# Legal body`;
    const result = parseFrontmatter(raw);

    expect(result.alwaysApply).toBe(false);
    expect(result.invalidBooleans).toEqual([]);
  });

  it('flags non-boolean always-apply values as invalid (no silent drop)', () => {
    const raw = `---\nname: n\ndescription: d\nalways-apply: yes\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['always-apply']);
  });

  it('flags non-boolean alwaysApply values as invalid (no silent drop)', () => {
    const raw = `---\nname: n\ndescription: d\nalwaysApply: yes\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['alwaysApply']);
  });

  it('flags legacy YAML boolean aliases as invalid', () => {
    const raw = `---\nname: n\ndescription: d\nalways-apply: on\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['always-apply']);
  });

  it.each(['null', '~'])('flags always-apply: %s as invalid', (value) => {
    const raw = `---\nname: n\ndescription: d\nalways-apply: ${value}\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.alwaysApply).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['always-apply']);
  });

  it.each(['null', '~'])('flags indented always-apply: %s as invalid', (value) => {
    const raw = `---\n  name: n\n  description: d\n  always-apply: ${value}\n---\n\nbody`;
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
      frontmatter: { 'always-apply': true },
      invalidBooleans: [],
    });
  });

  it('returns empty fields when no frontmatter block is present', () => {
    const raw = '# Just a body with no frontmatter';
    expect(parseFrontmatter(raw)).toEqual({
      name: '',
      description: '',
      frontmatter: {},
      invalidBooleans: [],
    });
  });

  it('extracts frontmatter after a BOM and leading blank lines', () => {
    const raw = `\uFEFF\n\n---\nname: prologue\ndescription: Has leading whitespace.\n---\n\nbody`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'prologue',
      description: 'Has leading whitespace.',
      alwaysApply: undefined,
      frontmatter: {},
      invalidBooleans: [],
    });
  });

  it('does not treat frontmatter scalar lines that start with --- text as closing fences', () => {
    const raw = `---\nname: marker\ndescription: 'first\n---not a closing fence\nlast'\nalways-apply: false\n---\n\nbody`;
    expect(parseFrontmatter(raw)).toEqual({
      name: 'marker',
      description: 'first ---not a closing fence last',
      alwaysApply: false,
      frontmatter: { 'always-apply': false },
      invalidBooleans: [],
    });
  });

  it('returns empty fields when frontmatter is unterminated', () => {
    const raw = `---\nname: incomplete\n`;
    expect(parseFrontmatter(raw)).toEqual({
      name: '',
      description: '',
      frontmatter: {},
      invalidBooleans: [],
    });
  });

  it('returns empty fields when frontmatter YAML is malformed', () => {
    const raw = `---\nname: [\n---\n\nbody`;
    expect(parseFrontmatter(raw)).toEqual(
      expect.objectContaining({
        name: '',
        description: '',
        invalidBooleans: [],
        parseError: expect.any(String),
      }),
    );
  });

  it('rejects case-colliding recognized frontmatter keys', () => {
    const raw = `---\nname: duplicate-case\ndescription: Duplicate key variants.\nallowed-tools:\n  - execute_code\nAllowed-Tools:\n  - web_search\n---\n\nbody`;

    expect(parseFrontmatter(raw)).toEqual(
      expect.objectContaining({
        name: '',
        description: '',
        invalidBooleans: [],
        parseError: expect.stringContaining(
          'Recognized frontmatter keys "allowed-tools" and "Allowed-Tools" both resolve to "allowed-tools"',
        ),
      }),
    );
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

  it('extracts user-invocable and disable-model-invocation alongside always-apply', () => {
    const raw = [
      '---',
      'name: test-skill',
      'description: test',
      'always-apply: true',
      'user-invocable: false',
      'disable-model-invocation: true',
      '---',
      'Test body.',
    ].join('\n');

    expect(parseFrontmatter(raw)).toEqual({
      name: 'test-skill',
      description: 'test',
      alwaysApply: true,
      userInvocable: false,
      disableModelInvocation: true,
      frontmatter: {
        'always-apply': true,
        'user-invocable': false,
        'disable-model-invocation': true,
      },
      invalidBooleans: [],
    });
  });

  it.each([
    ['user-invocable', 'userInvocable'],
    ['disable-model-invocation', 'disableModelInvocation'],
  ] as const)('extracts %s: false', (key, field) => {
    const raw = `---\nname: n\ndescription: d\n${key}: false\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result[field]).toBe(false);
    expect(result.frontmatter).toEqual({ [key]: false });
    expect(result.invalidBooleans).toEqual([]);
  });

  it.each(['user-invocable', 'disable-model-invocation'])(
    'flags a non-boolean %s value instead of silently defaulting it',
    (key) => {
      const raw = `---\nname: n\ndescription: d\n${key}: yes\n---\n\nbody`;
      const result = parseFrontmatter(raw);
      expect(result.invalidBooleans).toEqual([key]);
      expect(result.frontmatter).toEqual({});
    },
  );

  it.each(['user-invocable', 'disable-model-invocation'])(
    'treats an empty %s value as absent (mid-edit placeholder)',
    (key) => {
      const raw = `---\nname: n\ndescription: d\n${key}:\n---\n\nbody`;
      const result = parseFrontmatter(raw);
      expect(result.invalidBooleans).toEqual([]);
      expect(result.frontmatter).toEqual({});
    },
  );

  it.each([
    ['mapping', '  value: false'],
    ['sequence', '  - false'],
    ['multi-line scalar', '  false\n  extra'],
  ])('rejects a %s value for an invocation flag', (_shape, value) => {
    const raw = `---\nname: n\ndescription: d\nuser-invocable:\n${value}\n---\n\nbody`;
    const result = parseFrontmatter(raw);

    expect(result.userInvocable).toBeUndefined();
    expect(result.invalidBooleans).toEqual(['user-invocable']);
    expect(result.frontmatter).toEqual({});
  });

  it('normalizes quoted and comment-trailed invocation booleans', () => {
    const raw = [
      '---',
      'name: n',
      'description: d',
      'user-invocable: "false" # manual off',
      "disable-model-invocation: 'true'",
      '---',
      'body',
    ].join('\n');
    const result = parseFrontmatter(raw);

    expect(result.userInvocable).toBe(false);
    expect(result.disableModelInvocation).toBe(true);
    expect(result.frontmatter).toEqual({
      'user-invocable': false,
      'disable-model-invocation': true,
    });
  });

  it('accepts a YAML alias that resolves to a boolean', () => {
    const raw = `---\nname: n\ndescription: d\ndefault: &off false\nuser-invocable: *off\n---\n\nbody`;

    expect(parseFrontmatter(raw)).toMatchObject({
      userInvocable: false,
      invalidBooleans: [],
      frontmatter: { 'user-invocable': false },
    });
  });

  it('is case-insensitive on the new flag keys', () => {
    const raw = `---\nname: n\ndescription: d\nUser-Invocable: FALSE\nDISABLE-MODEL-INVOCATION: True\n---\n\nbody`;
    const result = parseFrontmatter(raw);

    expect(result.userInvocable).toBe(false);
    expect(result.disableModelInvocation).toBe(true);
  });

  it('reports every malformed flag at once', () => {
    const raw = [
      '---',
      'name: n',
      'description: d',
      'always-apply: tru',
      'user-invocable: nope',
      'disable-model-invocation: 1',
      '---',
      'body',
    ].join('\n');

    expect(parseFrontmatter(raw).invalidBooleans).toEqual([
      'always-apply',
      'user-invocable',
      'disable-model-invocation',
    ]);
  });

  it('keeps recognized non-flag frontmatter in the bag', () => {
    const raw = [
      '---',
      'name: n',
      'description: d',
      'when-to-use: When demoing.',
      'allowed-tools:',
      '  - web_search',
      'license: MIT',
      '---',
      'body',
    ].join('\n');

    expect(parseFrontmatter(raw).frontmatter).toEqual({
      'when-to-use': 'When demoing.',
      'allowed-tools': ['web_search'],
      license: 'MIT',
    });
  });

  it('drops unrecognized and malformed non-flag keys rather than failing the parse', () => {
    const raw = [
      '---',
      'name: n',
      'description: d',
      'icon: rocket',
      'version: 1.0',
      'user-invocable: false',
      '---',
      'body',
    ].join('\n');
    const result = parseFrontmatter(raw);

    expect(result.frontmatter).toEqual({ 'user-invocable': false });
    expect(result.invalidBooleans).toEqual([]);
    expect(result.parseError).toBeUndefined();
  });

  it.each([
    ['always-apply', 'true', 'alwaysApply', true],
    ['user-invocable', 'false', 'userInvocable', false],
    ['disable-model-invocation', 'true', 'disableModelInvocation', true],
  ] as const)(
    'resolves %s when YAML continues the value on the next line',
    (key, text, field, expected) => {
      const raw = `---\nname: n\ndescription: d\n${key}:\n  ${text}\n---\n\nbody`;
      const result = parseFrontmatter(raw);

      expect(result[field]).toBe(expected);
      expect(result.invalidBooleans).toEqual([]);
      expect(result.frontmatter).toEqual({ [key]: expected });
    },
  );

  it('treats an empty flag value as a placeholder even when the mapping is indented', () => {
    /* The line scan is anchored at column zero, so an indented key yields no raw
       text to inspect. Judging by the parsed shape keeps a mid-edit placeholder
       from being reported as a malformed value. */
    const raw = `---\n  name: n\n  description: d\n  user-invocable:\n---\n\nbody`;
    const result = parseFrontmatter(raw);

    expect(result.userInvocable).toBeUndefined();
    expect(result.invalidBooleans).toEqual([]);
  });

  it('still flags a malformed value when the mapping is indented', () => {
    const raw = `---\n  name: n\n  description: d\n  user-invocable: tru\n---\n\nbody`;

    expect(parseFrontmatter(raw).invalidBooleans).toEqual(['user-invocable']);
  });

  it.each(['"user-invocable"', "'user-invocable'"])('reads a %s quoted key', (key) => {
    const raw = `---\nname: n\ndescription: d\n${key}: false\n---\n\nbody`;
    const result = parseFrontmatter(raw);

    expect(result.userInvocable).toBe(false);
    expect(result.frontmatter).toEqual({ 'user-invocable': false });
  });

  it('resolves flags when the whole frontmatter mapping is indented', () => {
    const raw = `---\n  name: n\n  description: d\n  user-invocable: false\n---\n\nbody`;
    const result = parseFrontmatter(raw);

    expect(result.userInvocable).toBe(false);
    expect(result.invalidBooleans).toEqual([]);
  });

  it('ignores a nested mapping key that reuses a flag name', () => {
    const raw = [
      '---',
      'name: n',
      'description: d',
      'metadata:',
      '  user-invocable: nonsense',
      'user-invocable: false',
      '---',
      'body',
    ].join('\n');
    const result = parseFrontmatter(raw);

    expect(result.userInvocable).toBe(false);
    expect(result.invalidBooleans).toEqual([]);
  });

  it('does not read a flag from a nested mapping when the top level omits it', () => {
    const raw = `---\nname: n\ndescription: d\nmetadata:\n  user-invocable: nonsense\n---\n\nbody`;
    const result = parseFrontmatter(raw);

    expect(result.userInvocable).toBeUndefined();
    expect(result.invalidBooleans).toEqual([]);
  });

  it('preserves frontmatter key order when rewriting flags', () => {
    const raw = [
      '---',
      'name: n',
      'description: d',
      'user-invocable: "false"',
      'license: MIT',
      '---',
      'body',
    ].join('\n');

    expect(Object.keys(parseFrontmatter(raw).frontmatter)).toEqual(['user-invocable', 'license']);
  });
});

describe('createImportHandler', () => {
  it('streams each additional archive file once when filters are disabled', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const buffer = await zipWithAdditionalFiles(3, 128);
    const streamSpy = spyOnZipEntryStreams();
    const res = mockResponse();

    try {
      await handler(mockZipRequest(buffer), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(streamSpy).toHaveBeenCalledTimes(4);
      expect(deps.saveBuffer).toHaveBeenCalledTimes(3);
    } finally {
      streamSpy.mockRestore();
    }
  });

  it('uses request-scoped import limits', async () => {
    const buffer = await zipWithAdditionalFiles(0, 0);
    const deps = mockImportDeps(() => ({
      maxZipBytes: buffer.length - 1,
    }));
    const handler = createImportHandler(deps);
    const res = mockResponse();

    await handler(mockZipRequest(buffer), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('File too large'),
      }),
    );
  });

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

  it('bounds SKILL.md inflation even when archive headers understate its size', async () => {
    const kib = 1024;
    const deps = mockImportDeps({
      maxZipBytes: 1024 * kib,
      maxEntries: 10,
      maxSingleFileBytes: kib,
      maxDecompressedBytes: 16 * kib,
    });
    const handler = createImportHandler(deps);
    const oversized = await zipWithSkillMarkdown(
      [
        '---',
        'name: forged-size-skill',
        'description: Forged size regression.',
        '---',
        'A'.repeat(64 * kib),
      ].join('\n'),
    );
    const res = mockResponse();

    await handler(mockZipRequest(forgeSkillMarkdownDeclaredSize(oversized, 1)), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: 'SKILL.md exceeds maximum file size' });
    expect(deps.createSkill).not.toHaveBeenCalled();
  });

  it('rejects malformed YAML frontmatter in markdown imports', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();

    await handler(mockMarkdownRequest('---\nname: [\n---\n\nbody'), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'Validation failed',
        issues: expect.arrayContaining([
          expect.objectContaining({
            field: 'frontmatter',
            code: 'INVALID_YAML',
          }),
        ]),
      }),
    );
    expect(deps.createSkill).not.toHaveBeenCalled();
  });

  it('rejects malformed YAML frontmatter in archive imports', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const buffer = await zipWithSkillMarkdown('---\nname: [\n---\n\nbody');

    await handler(mockZipRequest(buffer), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'Validation failed',
        issues: expect.arrayContaining([
          expect.objectContaining({
            field: 'frontmatter',
            code: 'INVALID_YAML',
          }),
        ]),
      }),
    );
    expect(deps.createSkill).not.toHaveBeenCalled();
  });

  it('blocks configured Markdown content before creating a skill', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      skills: {
        pii: {
          fields: ['instructions'],
          starterPatterns: [],
          customPatterns: [{ id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' }],
        },
      },
    });
    const markdown = [
      '---',
      'name: filtered-skill',
      'description: A filtered skill used by tests.',
      '---',
      'Use PRIVATE-1234 to authenticate.',
    ].join('\n');

    await handler(mockMarkdownRequest(markdown, 'filtered-skill.md', config), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_block',
        source: 'skill',
        field: 'instructions',
      }),
    );
    expect(deps.createSkill).not.toHaveBeenCalled();
  });

  it('does not traverse unselected nested frontmatter for a name-only policy', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      skills: {
        pii: {
          fields: ['name'],
          starterPatterns: [],
          customPatterns: [{ id: 'private_token', label: 'private token', regex: 'PRIVATE-DEEP' }],
        },
      },
    });

    await handler(
      mockMarkdownRequest(
        deeplyNestedFrontmatterMarkdown('PRIVATE-DEEP'),
        'scoped-skill.md',
        config,
      ),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(deps.createSkill).toHaveBeenCalledTimes(1);
    expect(deps.grantPermission).toHaveBeenCalledTimes(1);
  });

  it('fails closed when selected frontmatter exceeds the traversal budget', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      skills: {
        pii: {
          fields: ['frontmatter'],
          starterPatterns: [],
          customPatterns: [{ id: 'private_token', label: 'private token', regex: 'PRIVATE-DEEP' }],
        },
      },
    });

    await handler(
      mockMarkdownRequest(
        deeplyNestedFrontmatterMarkdown('PRIVATE-DEEP'),
        'scoped-skill.md',
        config,
      ),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_uninspectable',
        source: 'skill',
        field: 'frontmatter',
      }),
    );
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE-DEEP');
    expect(deps.createSkill).not.toHaveBeenCalled();
  });

  it('fails closed for oversized Markdown selected by the skill file_text policy', async () => {
    const deps = mockImportDeps({ maxContentInspectionBytes: 64 });
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      skills: {
        pii: {
          fields: ['file_text'],
          starterPatterns: ['sk_prefix'],
        },
      },
    });
    const markdown = [
      '---',
      'name: oversized-skill',
      'description: An oversized skill used by tests.',
      '---',
      'A'.repeat(128),
    ].join('\n');

    await handler(mockMarkdownRequest(markdown, 'oversized-skill.md', config), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_uninspectable',
        source: 'file',
        field: 'content',
      }),
    );
    expect(deps.createSkill).not.toHaveBeenCalled();
  });

  it('preflights all known-text archive files before creating or storing content', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          customPatterns: [{ id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' }],
        },
      },
    });
    const zip = new JSZip();
    zip.file(
      'SKILL.md',
      [
        '---',
        'name: archive-filter',
        'description: Archive filtering test skill.',
        '---',
        '# Safe instructions',
      ].join('\n'),
    );
    zip.file('references/safe.txt', 'Safe content');
    zip.file('references/private.txt', 'Use PRIVATE-1234 to authenticate.');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await handler(mockZipRequest(buffer, config), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_block',
        source: 'file',
        field: 'extracted_text',
      }),
    );
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.saveBuffer).not.toHaveBeenCalled();
    expect(deps.upsertSkillFile).not.toHaveBeenCalled();
  });

  it('allows archives beyond the content inspection budget in compatibility mode', async () => {
    const kib = 1024;
    const deps = mockImportDeps({
      maxZipBytes: 1024 * kib,
      maxEntries: 50,
      maxSingleFileBytes: 16 * kib,
      maxDecompressedBytes: 128 * kib,
      maxContentInspectionBytes: 3 * kib,
    });
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          customPatterns: [{ id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' }],
        },
      },
    });
    const buffer = await zipWithAdditionalFiles(10, 2 * kib);
    const streamSpy = spyOnZipEntryStreams();

    try {
      await handler(mockZipRequest(buffer, config), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(streamSpy.mock.calls.length).toBeGreaterThan(3);
      expect(deps.createSkill).toHaveBeenCalledTimes(1);
      expect(deps.grantPermission).toHaveBeenCalledTimes(1);
      expect(deps.saveBuffer).toHaveBeenCalledTimes(10);
      expect(deps.upsertSkillFile).toHaveBeenCalledTimes(10);
    } finally {
      streamSpy.mockRestore();
    }
  });

  it('blocks archives beyond the content inspection budget in fail-closed mode', async () => {
    const kib = 1024;
    const deps = mockImportDeps({
      maxZipBytes: 1024 * kib,
      maxEntries: 50,
      maxSingleFileBytes: 16 * kib,
      maxDecompressedBytes: 128 * kib,
      maxContentInspectionBytes: 3 * kib,
    });
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      files: {
        pii: {
          fields: ['extracted_text'],
          uninspectable: 'block',
          starterPatterns: [],
          customPatterns: [{ id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' }],
        },
      },
    });
    const buffer = await zipWithAdditionalFiles(10, 2 * kib);

    await handler(mockZipRequest(buffer, config), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({
      error: 'content_filter_uninspectable',
      message: 'Submitted file content could not be inspected before processing.',
      source: 'file',
      field: 'extracted_text',
    });
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.grantPermission).not.toHaveBeenCalled();
    expect(deps.saveBuffer).not.toHaveBeenCalled();
    expect(deps.upsertSkillFile).not.toHaveBeenCalled();
  });

  it('fails closed beyond the archive budget when skill file_text is selected', async () => {
    const kib = 1024;
    const deps = mockImportDeps({
      maxZipBytes: 1024 * kib,
      maxEntries: 50,
      maxSingleFileBytes: 16 * kib,
      maxDecompressedBytes: 128 * kib,
      maxContentInspectionBytes: 3 * kib,
    });
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      skills: {
        pii: {
          fields: ['file_text'],
          starterPatterns: ['sk_prefix'],
        },
      },
      files: {
        pii: {
          fields: ['content'],
          starterPatterns: [],
          uninspectable: 'allow',
        },
      },
    });
    const buffer = await zipWithAdditionalFiles(10, 2 * kib);

    await handler(mockZipRequest(buffer, config), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_uninspectable',
        source: 'file',
        field: 'content',
      }),
    );
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.saveBuffer).not.toHaveBeenCalled();
    expect(deps.upsertSkillFile).not.toHaveBeenCalled();
  });

  it('does not apply the content inspection budget to filename-only filters', async () => {
    const kib = 1024;
    const deps = mockImportDeps({
      maxContentInspectionBytes: 1,
    });
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      skills: {
        pii: {
          fields: ['file_name'],
          starterPatterns: [],
          customPatterns: [{ id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' }],
        },
      },
    });
    const buffer = await zipWithAdditionalFiles(1, 2 * kib);

    await handler(mockZipRequest(buffer, config), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(deps.createSkill).toHaveBeenCalledTimes(1);
    expect(deps.saveBuffer).toHaveBeenCalledTimes(1);
    expect(deps.upsertSkillFile).toHaveBeenCalledTimes(1);
  });

  it('keeps archive files on one persistence pass for unrelated filters', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const buffer = await zipWithAdditionalFiles(3, 128);
    const streamSpy = spyOnZipEntryStreams();
    const res = mockResponse();
    const config = mockAppConfig({
      messages: {
        pii: {
          fields: ['text'],
        },
      },
    });

    try {
      await handler(mockZipRequest(buffer, config), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(streamSpy).toHaveBeenCalledTimes(4);
      expect(deps.saveBuffer).toHaveBeenCalledTimes(3);
    } finally {
      streamSpy.mockRestore();
    }
  });

  it.each([
    [
      'skill',
      {
        skills: {
          pii: {
            fields: ['file_text'],
            starterPatterns: [],
          },
        },
      },
    ],
    [
      'file',
      {
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
          },
        },
      },
    ],
  ] as Array<[string, FiltersConfig]>)(
    'keeps archive files on one persistence pass for an inactive %s policy',
    async (_source, filters) => {
      const deps = mockImportDeps();
      const handler = createImportHandler(deps);
      const buffer = await zipWithAdditionalFiles(3, 128);
      const streamSpy = spyOnZipEntryStreams();
      const res = mockResponse();

      try {
        await handler(mockZipRequest(buffer, mockAppConfig(filters)), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(streamSpy).toHaveBeenCalledTimes(4);
        expect(deps.saveBuffer).toHaveBeenCalledTimes(3);
      } finally {
        streamSpy.mockRestore();
      }
    },
  );

  it('does not decode binary archive file bytes for filtering', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          customPatterns: [{ id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' }],
        },
      },
    });
    const zip = new JSZip();
    zip.file(
      'SKILL.md',
      [
        '---',
        'name: binary-filter',
        'description: Binary filtering test skill.',
        '---',
        '# Safe instructions',
      ].join('\n'),
    );
    zip.file(
      'assets/private.png',
      Buffer.concat([Buffer.from([0, 255, 0]), Buffer.from('PRIVATE-1234')]),
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const streamSpy = spyOnZipEntryStreams();

    try {
      await handler(mockZipRequest(buffer, config), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(streamSpy).toHaveBeenCalledTimes(3);
      expect(deps.createSkill).toHaveBeenCalledTimes(1);
      expect(deps.saveBuffer).toHaveBeenCalledTimes(1);
      expect(deps.upsertSkillFile).toHaveBeenCalledTimes(1);
    } finally {
      streamSpy.mockRestore();
    }
  });

  it('fails closed for binary archive entries selected by skill file_text', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      skills: {
        pii: {
          fields: ['file_text'],
          starterPatterns: ['sk_prefix'],
        },
      },
    });
    const zip = new JSZip();
    zip.file(
      'SKILL.md',
      [
        '---',
        'name: binary-skill-filter',
        'description: Binary skill filtering test.',
        '---',
        '# Safe instructions',
      ].join('\n'),
    );
    zip.file('assets/private.png', Buffer.from([0, 255, 0, 137, 80, 78, 71]));
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await handler(mockZipRequest(buffer, config), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_uninspectable',
        source: 'file',
        field: 'content',
      }),
    );
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.saveBuffer).not.toHaveBeenCalled();
    expect(deps.upsertSkillFile).not.toHaveBeenCalled();
  });

  it('blocks opaque archive entries before creating or storing a skill when fail-closed', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const config = mockAppConfig({
      files: {
        pii: {
          fields: ['content'],
          uninspectable: 'block',
        },
      },
    } as FiltersConfig);
    const zip = new JSZip();
    zip.file(
      'SKILL.md',
      [
        '---',
        'name: binary-filter',
        'description: Binary filtering test skill.',
        '---',
        '# Safe instructions',
      ].join('\n'),
    );
    zip.file('assets/private.png', Buffer.from([0, 255, 0, 137, 80, 78, 71]));
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await handler(mockZipRequest(buffer, config), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({
      error: 'content_filter_uninspectable',
      message: 'Submitted file content could not be inspected before processing.',
      source: 'file',
      field: 'content',
    });
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.saveBuffer).not.toHaveBeenCalled();
    expect(deps.upsertSkillFile).not.toHaveBeenCalled();
  });

  it('forwards every invocation-mode flag from a markdown import', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();

    await handler(mockMarkdownRequest(INVOCATION_MODE_SKILL_MD, 'test-skill.md'), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'test-skill',
        alwaysApply: true,
        frontmatter: {
          'always-apply': true,
          'user-invocable': false,
          'disable-model-invocation': true,
        },
      }),
    );
  });

  it('forwards every invocation-mode flag from an archive import', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const buffer = await zipWithSkillMarkdown(INVOCATION_MODE_SKILL_MD);

    await handler(mockZipRequest(buffer), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        alwaysApply: true,
        frontmatter: {
          'always-apply': true,
          'user-invocable': false,
          'disable-model-invocation': true,
        },
      }),
    );
  });

  it('forwards allowed-tools so the derived column is populated on import', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const markdown = [
      '---',
      'name: tooled-skill',
      'description: A skill that declares extra tools.',
      'allowed-tools:',
      '  - web_search',
      '  - file_search',
      '---',
      'body',
    ].join('\n');

    await handler(mockMarkdownRequest(markdown, 'tooled-skill.md'), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        frontmatter: { 'allowed-tools': ['web_search', 'file_search'] },
      }),
    );
  });

  it.each(['user-invocable', 'disable-model-invocation'])(
    'rejects a malformed %s value instead of importing it at the schema default',
    async (key) => {
      const deps = mockImportDeps();
      const handler = createImportHandler(deps);
      const res = mockResponse();
      const markdown = `---\nname: broken-skill\ndescription: A skill with a bad flag.\n${key}: yes\n---\n\nbody`;

      await handler(mockMarkdownRequest(markdown, 'broken-skill.md'), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: 'Validation failed',
          issues: [
            {
              field: `frontmatter.${key}`,
              code: 'INVALID_TYPE',
              message: `"${key}" must be a boolean (true or false)`,
            },
          ],
        }),
      );
      expect(deps.createSkill).not.toHaveBeenCalled();
    },
  );

  it('imports a file carrying unknown frontmatter keys, dropping only those keys', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();
    const markdown = [
      '---',
      'name: ecosystem-skill',
      'description: Authored for another skill ecosystem.',
      'icon: rocket',
      'version: 1.0',
      'user-invocable: false',
      '---',
      'body',
    ].join('\n');

    await handler(mockMarkdownRequest(markdown, 'ecosystem-skill.md'), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        frontmatter: { 'user-invocable': false },
      }),
    );
  });

  it('sends an empty frontmatter bag when the file has no frontmatter block', async () => {
    const deps = mockImportDeps();
    const handler = createImportHandler(deps);
    const res = mockResponse();

    await handler(mockMarkdownRequest('# Just a body', 'bodyless-skill.md'), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'bodyless-skill',
        frontmatter: {},
      }),
    );
  });
});
