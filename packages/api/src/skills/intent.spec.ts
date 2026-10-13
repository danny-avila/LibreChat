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

it('persists the canonical provider key instead of a public URL', async () => {
  const deps = makeDeps();
  const operation = makeOperation();
  operation.reservation = {
    filepath: 'https://cdn.example.test/temporary-signed-url',
    storageKey: 'skills/owner/file-1',
  };
  await withSkillUploadIntent(deps, operation);
  expect(deps.reserveSkillUploadIntent).toHaveBeenCalledWith(
    expect.objectContaining({ storageKey: 'skills/owner/file-1' }),
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

it.each([null, '', '   '])('compensates a storage write with no usable path (%p)', async (path) => {
  const deps = makeDeps();
  const operation = makeOperation();
  operation.save = jest.fn(async () => path as string);

  await expect(withSkillUploadIntent(deps, operation)).rejects.toThrow(
    'Skill storage returned no saved object path',
  );
  expect(operation.persist).not.toHaveBeenCalled();
  expect(operation.deleteReserved).toHaveBeenCalledWith(operation.reservation, undefined);
});

it.each(['uploading', 'committing'] as const)(
  'compensates the reserved blob even when the %s abandonment update throws',
  async (failedState) => {
    const deps = makeDeps();
    const operation = makeOperation();
    operation.save = jest.fn(async () => {
      throw new Error('provider timeout');
    });
    deps.transitionSkillUploadIntent.mockImplementation(async (_fileId, _writerId, from, to) => {
      if (from === failedState && to === 'abandoned') throw new Error('database unavailable');
      return true;
    });

    await expect(withSkillUploadIntent(deps, operation)).rejects.toThrow('provider timeout');
    expect(deps.transitionSkillUploadIntent).toHaveBeenCalledWith(
      'file-1',
      expect.any(String),
      'uploading',
      'abandoned',
    );
    expect(deps.transitionSkillUploadIntent).toHaveBeenCalledWith(
      'file-1',
      expect.any(String),
      'committing',
      'abandoned',
    );
    expect(operation.deleteReserved).toHaveBeenCalledWith(operation.reservation, undefined);
  },
);

it('preserves the original failure for stopped-writer recovery if journal and cleanup both fail', async () => {
  const deps = makeDeps();
  const operation = makeOperation();
  operation.save = jest.fn(async () => {
    throw new Error('provider timeout');
  });
  deps.transitionSkillUploadIntent.mockRejectedValue(new Error('database unavailable'));
  operation.deleteReserved = jest.fn(async () => {
    throw new Error('storage unavailable');
  });

  await expect(withSkillUploadIntent(deps, operation)).rejects.toThrow('provider timeout');
  expect(deps.reserveSkillUploadIntent).toHaveBeenCalledTimes(1);
  expect(deps.transitionSkillUploadIntent).toHaveBeenCalledTimes(2);
  expect(operation.deleteReserved).toHaveBeenCalledTimes(1);
  // The intent is intentionally retained. If both stores stay unavailable,
  // an operator must recover the stopped writer before background cleanup.
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
