import path from 'node:path';
import { hashSync } from 'bcryptjs';
import { createHashPool } from './hashing';

const workerPath = path.join(
  path.dirname(require.resolve('@librechat/api')),
  'auth/hash-worker.cjs',
);

describe('bcrypt hash pool', () => {
  const pool = createHashPool(workerPath, 2);
  afterAll(async () => pool.close());

  it('hashes and verifies a secret', async () => {
    const hash = await pool.hash('correct horse', 4);

    await expect(pool.compare('correct horse', hash)).resolves.toBe(true);
    await expect(pool.compare('wrong horse', hash)).resolves.toBe(false);
  });

  it('verifies hashes written before the pool existed', async () => {
    await expect(pool.compare('legacy', hashSync('legacy', 4))).resolves.toBe(true);
  });

  it('keeps the event loop responsive while several hashes run', async () => {
    let worstLagMs = 0;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      worstLagMs = Math.max(worstLagMs, now - last - 5);
      last = now;
    }, 5);
    try {
      await Promise.all(Array.from({ length: 4 }, (_, i) => pool.hash(`secret-${i}`, 10)));
    } finally {
      clearInterval(timer);
    }
    /* A single cost-10 bcryptjs hash holds the main thread for roughly 70 ms or more. */
    expect(worstLagMs).toBeLessThan(50);
  });

  it('rejects a job whose worker dies instead of leaving it pending', async () => {
    const crashing = createHashPool(
      path.join(__dirname, '__fixtures__', 'crashing-hash-worker.cjs'),
      1,
    );

    await expect(crashing.hash('secret', 4)).rejects.toThrow('Password hashing worker stopped');
    await crashing.close();
  });
});
