import type { ISkillUploadIntent } from '@librechat/data-schemas';
import type { SkillUploadIntentDeps, SkillUploadOperation } from './intent';
import { withSkillUploadIntent } from './intent';

function makeDeps(): jest.Mocked<SkillUploadIntentDeps> {
  return {
    reserveSkillUploadIntent: jest.fn(
      async (input) =>
        ({
          ...input,
          state: 'uploading' as const,
        }) as unknown as ISkillUploadIntent,
    ),
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
    isPersisted: jest.fn(async () => false),
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

it('does not delete a blob after an ambiguous database commit', async () => {
  const deps = makeDeps();
  const operation = makeOperation();
  operation.persist = jest.fn(async () => {
    throw new Error('lost database reply');
  });
  operation.isPersisted = jest.fn(async () => true);
  await expect(withSkillUploadIntent(deps, operation)).rejects.toThrow('lost database reply');
  expect(operation.deleteReserved).not.toHaveBeenCalled();
});

it.each(['acknowledgement rejected', 'reply lost'] as const)(
  'returns a persisted upload after recovering %s',
  async (scenario) => {
    const deps = makeDeps();
    const operation = makeOperation();
    operation.isPersisted = jest.fn(async () => true);
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
