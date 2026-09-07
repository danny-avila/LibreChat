import { waitForGenerationPersistence } from './persistence';

test('waits for the captured terminal epoch to finish persistence', async () => {
  const read = jest
    .fn()
    .mockResolvedValueOnce({ createdAt: 1, metadata: { terminalPersistencePending: true } })
    .mockResolvedValueOnce({ createdAt: 1, metadata: { terminalPersistencePending: false } });
  await waitForGenerationPersistence('run', 1, read, { pollMs: 1 });
  expect(read).toHaveBeenCalledTimes(2);
});

test('does not wait on a replacement epoch', async () => {
  const read = jest
    .fn()
    .mockResolvedValue({ createdAt: 2, metadata: { terminalPersistencePending: true } });
  await waitForGenerationPersistence('run', 1, read);
  expect(read).toHaveBeenCalledTimes(1);
});

test('fails closed on persistent terminal writes and lookup errors', async () => {
  const read = jest
    .fn()
    .mockResolvedValue({ createdAt: 1, metadata: { terminalPersistencePending: true } });
  await expect(waitForGenerationPersistence('run', 1, read, { timeoutMs: 0 })).rejects.toThrow(
    'Timed out',
  );
  read.mockRejectedValue(new Error('unavailable'));
  await expect(waitForGenerationPersistence('run', 1, read)).rejects.toThrow('unavailable');
});
