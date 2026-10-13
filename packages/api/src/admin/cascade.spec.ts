import { cascadeStep, runCascade } from './cascade';

describe('runCascade', () => {
  it('reports failed steps and restores only the steps that were removed', async () => {
    const restoreA = jest.fn().mockResolvedValue(undefined);
    const restoreB = jest.fn().mockResolvedValue(undefined);
    const outcome = await runCascade(
      [
        cascadeStep('a', async () => ['x'], restoreA),
        cascadeStep('b', async () => Promise.reject(new Error('boom')), restoreB),
      ],
      '[test]',
    );

    expect(outcome.failed).toEqual(['b']);
    await outcome.compensate();
    expect(restoreA).toHaveBeenCalledWith(['x']);
    expect(restoreB).not.toHaveBeenCalled();
  });

  it('keeps restoring when one restore throws', async () => {
    const restoreB = jest.fn().mockResolvedValue(undefined);
    const outcome = await runCascade(
      [
        cascadeStep(
          'a',
          async () => 1,
          async () => Promise.reject(new Error('restore failed')),
        ),
        cascadeStep('b', async () => 2, restoreB),
      ],
      '[test]',
    );

    await expect(outcome.compensate()).resolves.toBeUndefined();
    expect(restoreB).toHaveBeenCalledWith(2);
  });
});
