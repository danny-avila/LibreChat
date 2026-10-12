import type { SkillUploadIntentDeps, SkillUploadOperation } from './intent';
import { withSkillUploadIntent } from './intent';

function makeDeps(): jest.Mocked<SkillUploadIntentDeps> {
  return {
    reserveSkillUploadIntent: jest.fn(async (input) => ({ fileId: input.fileId })),
    transitionSkillUploadIntent: jest.fn(async (_fileId, _writerId, _from, _to) => true),
  };
}

function makeOperation(): SkillUploadOperation<string> {
  return {
    skillId: '507f1f77bcf86cd799439011',
    author: '507f1f77bcf86cd799439012',
    fileId: 'file-1',
    source: 'local',
    reservation: { filepath: '/uploads/owner/file-1' },
    save: jest.fn(async () => '/uploads/owner/file-1'),
    persist: jest.fn(async () => 'saved'),
    readPersisted: jest.fn(async () => null),
    deleteReserved: jest.fn(async () => undefined),
  };
}

it('persists intent before writing bytes and acknowledges only after row commit', async () => {
  const deps = makeDeps();
  const operation = makeOperation();
  await expect(withSkillUploadIntent(deps, operation)).resolves.toBe('saved');
  expect(deps.reserveSkillUploadIntent.mock.invocationCallOrder[0]).toBeLessThan(
    (operation.save as jest.Mock).mock.invocationCallOrder[0],
  );
  expect(deps.transitionSkillUploadIntent.mock.invocationCallOrder[1]).toBeGreaterThan(
    (operation.persist as jest.Mock).mock.invocationCallOrder[0],
  );
});

it('keeps an abandoned intent even when immediate compensation succeeds', async () => {
  const deps = makeDeps();
  const operation = makeOperation();
  operation.save = jest.fn(async () => {
    throw new Error('provider timeout');
  });
  await expect(withSkillUploadIntent(deps, operation)).rejects.toThrow('provider timeout');
  expect(deps.transitionSkillUploadIntent).toHaveBeenCalledWith(
    'file-1',
    expect.any(String),
    'uploading',
    'abandoned',
  );
  expect(operation.deleteReserved).toHaveBeenCalled();
});

it('returns the persisted row after an ambiguous database commit', async () => {
  const deps = makeDeps();
  const operation = makeOperation();
  operation.persist = jest.fn(async () => {
    throw new Error('lost database reply');
  });
  operation.readPersisted = jest.fn(async () => 'recovered');
  await expect(withSkillUploadIntent(deps, operation)).resolves.toBe('recovered');
  expect(operation.deleteReserved).not.toHaveBeenCalled();
});

it.each(['acknowledgement rejected', 'reply lost'] as const)(
  'returns a persisted upload after recovering %s',
  async (scenario) => {
    const deps = makeDeps();
    const operation = makeOperation();
    operation.readPersisted = jest.fn(async () => 'saved');
    deps.transitionSkillUploadIntent.mockResolvedValueOnce(true);
    if (scenario === 'reply lost') {
      deps.transitionSkillUploadIntent.mockRejectedValueOnce(new Error('lost acknowledgement'));
    } else {
      deps.transitionSkillUploadIntent.mockResolvedValueOnce(false);
    }
    deps.transitionSkillUploadIntent.mockResolvedValueOnce(true);

    await expect(withSkillUploadIntent(deps, operation)).resolves.toBe('saved');
    expect(deps.transitionSkillUploadIntent).toHaveBeenCalledTimes(3);
    expect(operation.deleteReserved).not.toHaveBeenCalled();
  },
);
