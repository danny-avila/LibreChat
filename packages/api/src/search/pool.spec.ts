import { logger } from '@librechat/data-schemas';
import { createSearchPool } from './pool';

/**
 * pg hands a failure on an *idle* client back as an `error` event on the pool,
 * and Node rethrows an `error` emission that nobody listens for as an uncaught
 * exception. The emission below is that hazard exactly: a server-side
 * disconnect, a pooler recycling a connection, an idle timeout.
 */
describe('createSearchPool', () => {
  it('logs an idle client error instead of rethrowing it', async () => {
    const errors = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const pool = createSearchPool({ connectionString: 'postgres://nobody@127.0.0.1:1/none' });
    const failure = new Error('terminating connection due to administrator command');
    try {
      expect(() => pool.emit('error', failure)).not.toThrow();
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('[chatSearch]'), failure);
    } finally {
      errors.mockRestore();
      await pool.end();
    }
  });
});
