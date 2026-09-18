import { Types } from 'mongoose';
import type { DeleteSkillResult, ISkillFile } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { SkillsHandlersDeps } from './handlers';
import type { ServerRequest } from '~/types';
import { createSkillsHandlers } from './handlers';

function mockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn(() => res) as Response['status'];
  res.json = jest.fn(() => res) as Response['json'];
  return res;
}

describe('skill delete handler', () => {
  it('retries dependent cleanup before the deleted skill becomes unreachable', async () => {
    const id = new Types.ObjectId().toString();
    const deleteBlob = jest.fn(async () => undefined);
    const incomplete: DeleteSkillResult = {
      deleted: true,
      skillAbsent: true,
      cleanupComplete: false,
      failedCleanupSteps: ['skill_files'],
    };
    const complete: DeleteSkillResult = {
      deleted: false,
      skillAbsent: true,
      cleanupComplete: true,
      failedCleanupSteps: [],
    };
    const deleteSkill = jest.fn().mockResolvedValueOnce(incomplete).mockResolvedValueOnce(complete);
    const file = {
      relativePath: 'references/query.sql',
      filepath: '/uploads/query.sql',
      source: 'local',
    } as ISkillFile & { _id: Types.ObjectId };
    const handlers = createSkillsHandlers({
      deleteSkill,
      listSkillFiles: jest.fn(async () => [file]),
      getStrategyFunctions: jest.fn(() => ({ deleteFile: deleteBlob })),
      isValidObjectIdString: jest.fn(() => true),
    } as unknown as SkillsHandlersDeps);
    const req = { params: { id } } as unknown as ServerRequest;
    const res = mockResponse();

    await handlers.delete(req, res);

    expect(deleteSkill).toHaveBeenCalledTimes(2);
    expect(deleteBlob).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
