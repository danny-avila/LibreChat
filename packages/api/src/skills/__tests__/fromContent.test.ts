import { Types } from 'mongoose';

import type { ISkill, CreateSkillResult } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import type { CreateSkillFromMarkdownDeps } from '../import';

import { MAX_SKILL_MARKDOWN_BYTES } from '../fromFile';
import { createSkillFromContentHandler } from '../fromContent';

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

interface DepsConfig {
  createSkillImpl?: CreateSkillFromMarkdownDeps['createSkill'];
}

function mockDeps(config: DepsConfig = {}): {
  deps: CreateSkillFromMarkdownDeps;
  createSkill: jest.Mock;
} {
  const skill = {
    _id: new Types.ObjectId(),
    name: 'pdf-creation-skill',
    description: 'PDF Creation Skill',
  } as ISkill & { _id: Types.ObjectId };

  const createSkill =
    (config.createSkillImpl as jest.Mock) ??
    jest.fn(async () => ({ skill }) as unknown as CreateSkillResult);

  const deps: CreateSkillFromMarkdownDeps = {
    createSkill: createSkill as CreateSkillFromMarkdownDeps['createSkill'],
    deleteSkill: jest.fn(async () => ({ deleted: true })),
    grantPermission: jest.fn(async () => undefined),
  };

  return { deps, createSkill: createSkill as jest.Mock };
}

function mockRequest(body: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', _id: new Types.ObjectId(), username: 'tester' },
    body,
  } as unknown as ServerRequest;
}

describe('createFromContent', () => {
  it('creates a skill from content with a name override', async () => {
    const { deps, createSkill } = mockDeps();
    const { createFromContent } = createSkillFromContentHandler(deps);
    const res = mockResponse();
    await createFromContent(
      mockRequest({ content: '# PDF Creation Skill\n\nDoes a thing.', name: 'pdf-creation-skill' }),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(createSkill).toHaveBeenCalledTimes(1);
    expect(createSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'pdf-creation-skill', body: expect.stringContaining('# PDF Creation Skill') }),
    );
  });

  it('returns 400 for empty content', async () => {
    const { deps, createSkill } = mockDeps();
    const { createFromContent } = createSkillFromContentHandler(deps);
    const res = mockResponse();
    await createFromContent(mockRequest({ content: '   ', name: 'x' }), res);
    expect(res.statusCode).toBe(400);
    expect(createSkill).not.toHaveBeenCalled();
  });

  it('returns 400 when content is missing', async () => {
    const { deps, createSkill } = mockDeps();
    const { createFromContent } = createSkillFromContentHandler(deps);
    const res = mockResponse();
    await createFromContent(mockRequest({ name: 'x' }), res);
    expect(res.statusCode).toBe(400);
    expect(createSkill).not.toHaveBeenCalled();
  });

  it('returns 400 when content exceeds the size cap', async () => {
    const { deps, createSkill } = mockDeps();
    const { createFromContent } = createSkillFromContentHandler(deps);
    const res = mockResponse();
    const oversized = 'x'.repeat(MAX_SKILL_MARKDOWN_BYTES + 10);
    await createFromContent(mockRequest({ content: oversized, name: 'big-skill' }), res);
    expect(res.statusCode).toBe(400);
    expect(createSkill).not.toHaveBeenCalled();
  });

  it('maps a duplicate-name error to 409', async () => {
    const duplicate = Object.assign(new Error('dup'), { code: 11000 });
    const createSkillImpl = jest.fn(async () => {
      throw duplicate;
    }) as unknown as CreateSkillFromMarkdownDeps['createSkill'];
    const { deps } = mockDeps({ createSkillImpl });
    const { createFromContent } = createSkillFromContentHandler(deps);
    const res = mockResponse();
    await createFromContent(
      mockRequest({ content: '# PDF Creation Skill', name: 'pdf-creation-skill' }),
      res,
    );
    expect(res.statusCode).toBe(409);
  });
});
