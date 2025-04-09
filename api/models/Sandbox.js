const Sandbox = require('./schema/sandboxSchema');

async function createSandbox(sandboxId, sessionId, userId, timeoutInMilliSeconds) {
  const expiredAt = new Date(Date.now() + timeoutInMilliSeconds);
  return await Sandbox.create({ sandboxId, sessionId, userId, expiredAt });
}

async function setTimeoutForSandbox(sessionId, timeoutInMilliSeconds) {
  const newExpiredAt = new Date(Date.now() + timeoutInMilliSeconds);
  return await Sandbox.updateOne({ sessionId }, { expiredAt: newExpiredAt });
}

async function findSandboxById(sandboxId) {
  return await Sandbox.findOne({ sandboxId });
}

async function deleteSandboxBySessionId(sessionId) {
  return await Sandbox.deleteOne({ sessionId });
}

async function getActiveSandboxes(userId) {
  return await Sandbox.find({userId});
}

module.exports = {
  createSandbox,
  findSandboxById,
  deleteSandboxBySessionId,
  getActiveSandboxes,
  setTimeoutForSandbox,
};
