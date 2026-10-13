import { runSkillUploadRecoveryCli, runSkillUploadRecoveryCommand } from './recoveryCli';

function harness() {
  const messages: string[] = [];
  const errors: string[] = [];
  const deps = {
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    runAsSystem: async <T>(callback: () => Promise<T>) => callback(),
    getIntent: jest.fn(async () => ({
      fileId: 'file-1',
      writerId: 'writer-1',
      skillId: 'skill-1',
      state: 'committing',
    })),
    listIntents: jest.fn(async () => [
      {
        fileId: 'file-1',
        writerId: 'writer-1',
        skillId: 'skill-1',
        state: 'committing',
      },
    ]),
    recoverStoppedIntent: jest.fn(async () => ({
      status: 'recovered' as const,
      state: 'committed' as const,
    })),
    write: (message: string) => messages.push(message),
    writeError: (message: string) => errors.push(message),
  };
  return { deps, messages, errors };
}

it('requires explicit writer-drain confirmation before changing an intent', async () => {
  const h = harness();
  expect(await runSkillUploadRecoveryCli(['--help'], h.deps)).toBe(0);
  expect(await runSkillUploadRecoveryCli(['recover', 'file-1', 'writer-1'], h.deps)).toBe(2);
  expect(h.deps.connect).not.toHaveBeenCalled();
  expect(h.deps.recoverStoppedIntent).not.toHaveBeenCalled();
  expect(h.errors[0]).toContain('Stop or drain all API upload writers');
});

it('inspects and recovers a matching stopped writer through system context', async () => {
  const h = harness();
  expect(await runSkillUploadRecoveryCli(['inspect', 'file-1'], h.deps)).toBe(0);
  expect(JSON.parse(h.messages[0])).toEqual({
    fileId: 'file-1',
    writerId: 'writer-1',
    skillId: 'skill-1',
    state: 'committing',
  });
  expect(await runSkillUploadRecoveryCli(['inspect-skill', 'skill-1'], h.deps)).toBe(0);
  expect(JSON.parse(h.messages[1])).toEqual([
    { fileId: 'file-1', writerId: 'writer-1', skillId: 'skill-1', state: 'committing' },
  ]);
  expect(
    await runSkillUploadRecoveryCli(
      ['recover', 'file-1', 'writer-1', '--confirm-writers-drained'],
      h.deps,
    ),
  ).toBe(0);
  expect(h.deps.recoverStoppedIntent).toHaveBeenCalledWith('file-1', 'writer-1');
  expect(h.deps.disconnect).toHaveBeenCalledTimes(3);
});

it.each(['connect', 'getIntent', 'disconnect'] as const)(
  'reports bounded metadata when %s fails without logging driver details',
  async (step) => {
    const h = harness();
    h.deps[step].mockRejectedValueOnce(
      Object.assign(new Error('mongodb://user:secret@db.example/private'), {
        status: 503,
        query: { token: 'secret' },
      }),
    );

    expect(await runSkillUploadRecoveryCommand(['inspect', 'file-1'], h.deps)).toBe(1);
    expect(h.errors).toEqual(['{"type":"Error","status":503}']);
    expect(JSON.stringify(h.errors)).not.toContain('secret');
  },
);
