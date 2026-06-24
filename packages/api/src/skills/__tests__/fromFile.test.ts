import { Readable } from 'stream';
import { Types } from 'mongoose';

import type { IMongoFile, ISkill, CreateSkillResult } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import type { SkillFromFileDeps } from '../fromFile';

import { createSkillFromFileHandlers, MAX_SKILL_MARKDOWN_BYTES } from '../fromFile';

interface MockResponse extends Response {
  body?: unknown;
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

function mockFile(overrides: Partial<IMongoFile> = {}): IMongoFile {
  return {
    file_id: 'file-1',
    filename: 'SKILL.md',
    filepath: '/storage/file-1',
    source: 'local',
    user: 'user-1',
    bytes: 100,
    type: 'text/markdown',
    ...overrides,
  } as unknown as IMongoFile;
}

interface DepsConfig {
  files?: IMongoFile[];
  content?: string;
  createSkillImpl?: SkillFromFileDeps['createSkill'];
}

function mockDeps(config: DepsConfig = {}): {
  deps: SkillFromFileDeps;
  createSkill: jest.Mock;
  getFiles: jest.Mock;
} {
  const skill = {
    _id: new Types.ObjectId(),
    name: 'demo-skill',
    description: 'A skill created from a chat file.',
  } as ISkill & { _id: Types.ObjectId };

  const content = config.content ?? '---\nname: demo-skill\ndescription: A demo skill.\n---\n# Body';
  const files = config.files ?? [mockFile()];

  const getFiles = jest.fn(async () => files);
  const createSkill =
    (config.createSkillImpl as jest.Mock) ??
    jest.fn(async () => ({ skill }) as unknown as CreateSkillResult);

  const deps: SkillFromFileDeps = {
    getFiles,
    getStrategyFunctions: jest.fn(() => ({
      getDownloadStream: async () => Readable.from([Buffer.from(content, 'utf-8')]),
    })),
    createSkill: createSkill as SkillFromFileDeps['createSkill'],
    deleteSkill: jest.fn(async () => ({ deleted: true })),
    grantPermission: jest.fn(async () => undefined),
  };

  return { deps, createSkill: createSkill as jest.Mock, getFiles };
}

function mockRequest(body: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', _id: new Types.ObjectId(), username: 'tester' },
    body,
    query,
  } as unknown as ServerRequest;
}

describe('previewSkillFile', () => {
  it('flags SKILL.md by filename as a skill', async () => {
    const { deps } = mockDeps({ files: [mockFile({ filename: 'SKILL.md' })], content: '# Just a body' });
    const { previewSkillFile } = createSkillFromFileHandlers(deps);
    const res = mockResponse();
    await previewSkillFile(mockRequest({}, { fileId: 'file-1' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as { isSkill: boolean }).isSkill).toBe(true);
  });

  it('flags markdown with name+description frontmatter as a skill', async () => {
    const { deps } = mockDeps({
      files: [mockFile({ filename: 'report.md' })],
      content: '---\nname: my-skill\ndescription: Does a thing.\n---\n# Body',
    });
    const { previewSkillFile } = createSkillFromFileHandlers(deps);
    const res = mockResponse();
    await previewSkillFile(mockRequest({}, { fileId: 'file-1' }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as { isSkill: boolean; name: string; description: string };
    expect(body.isSkill).toBe(true);
    expect(body.name).toBe('my-skill');
    expect(body.description).toBe('Does a thing.');
  });

  it('does not flag a generic .md without full frontmatter', async () => {
    const { deps } = mockDeps({
      files: [mockFile({ filename: 'report.md' })],
      content: '---\nname: report\n---\n# A plain report',
    });
    const { previewSkillFile } = createSkillFromFileHandlers(deps);
    const res = mockResponse();
    await previewSkillFile(mockRequest({}, { fileId: 'file-1' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as { isSkill: boolean }).isSkill).toBe(false);
  });

  it('returns 404 when the file is not found / not owned', async () => {
    const { deps } = mockDeps({ files: [] });
    const { previewSkillFile } = createSkillFromFileHandlers(deps);
    const res = mockResponse();
    await previewSkillFile(mockRequest({}, { fileId: 'missing' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when fileId is missing', async () => {
    const { deps } = mockDeps();
    const { previewSkillFile } = createSkillFromFileHandlers(deps);
    const res = mockResponse();
    await previewSkillFile(mockRequest({}, {}), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('createFromFile', () => {
  it('creates a skill from a SKILL.md file', async () => {
    const { deps, createSkill } = mockDeps();
    const { createFromFile } = createSkillFromFileHandlers(deps);
    const res = mockResponse();
    await createFromFile(mockRequest({ fileId: 'file-1' }), res);
    expect(res.statusCode).toBe(201);
    expect(createSkill).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-skill .md with 422', async () => {
    const { deps, createSkill } = mockDeps({
      files: [mockFile({ filename: 'report.md' })],
      content: '# Just a report, no frontmatter',
    });
    const { createFromFile } = createSkillFromFileHandlers(deps);
    const res = mockResponse();
    await createFromFile(mockRequest({ fileId: 'file-1' }), res);
    expect(res.statusCode).toBe(422);
    expect(createSkill).not.toHaveBeenCalled();
  });

  it('returns 404 when the file is not found', async () => {
    const { deps } = mockDeps({ files: [] });
    const { createFromFile } = createSkillFromFileHandlers(deps);
    const res = mockResponse();
    await createFromFile(mockRequest({ fileId: 'missing' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('honors the name override', async () => {
    const { deps, createSkill } = mockDeps();
    const { createFromFile } = createSkillFromFileHandlers(deps);
    const res = mockResponse();
    await createFromFile(mockRequest({ fileId: 'file-1', name: 'renamed-skill' }), res);
    expect(res.statusCode).toBe(201);
    expect(createSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'renamed-skill' }),
    );
  });

  it('enforces the markdown size cap', async () => {
    const oversized = 'x'.repeat(MAX_SKILL_MARKDOWN_BYTES + 10);
    const { deps } = mockDeps({ content: oversized });
    const { createFromFile } = createSkillFromFileHandlers(deps);
    const res = mockResponse();
    await createFromFile(mockRequest({ fileId: 'file-1' }), res);
    expect(res.statusCode).toBe(500);
  });
});
