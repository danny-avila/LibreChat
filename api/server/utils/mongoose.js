const mongoose = require('mongoose');
/**
 * Executes a database operation within a session.
 * @param {() => Promise<any>} method - The method to execute. This method must accept a session as its first argument.
 * @param {...any} args - Additional arguments to pass to the method.
 * @returns {Promise<any>} - The result of the executed method.
 */
async function withSession(method, ...args) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await method(...args, session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = { withSession };
