const { PermissionBits, ResourceType } = require('librechat-data-provider');
const { handleCompactRequest, GenerationJobManager } = require('@librechat/api');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const { findAccessibleResources } = require('~/server/services/PermissionService');
const { logViolation } = require('~/cache');
const db = require('~/models');

/**
 * Express adapter for manual context compaction. The behaviour lives in
 * `@librechat/api`; this binds the model layer to it and renders the result.
 *
 * @param {ServerRequest} req
 * @param {ServerResponse} res
 */
const CompactController = async (req, res) => {
  const abortController = new AbortController();
  res.on('close', () => abortController.abort());

  const result = await handleCompactRequest(
    { req, res, signal: abortController.signal },
    {
      logViolation,
      getModelsConfig,
      getFiles: db.getFiles,
      getAgent: db.getAgent,
      skills: {
        getSkillByName: db.getSkillByName,
        findAccessibleSkillIds: () =>
          findAccessibleResources({
            userId: req.user.id,
            role: req.user.role,
            resourceType: ResourceType.SKILL,
            requiredPermissions: PermissionBits.VIEW,
          }),
      },
      getMessages: db.getMessages,
      saveMessage: db.saveMessage,
      deleteMessages: db.deleteMessages,
      getUserKey: db.getUserKey,
      getUserKeyValues: db.getUserKeyValues,
      getUserKeyExpiry: db.getUserKeyExpiry,
      getJob: (streamId) => GenerationJobManager.getJob(streamId),
      getMultiplier: db.getMultiplier,
      getCacheMultiplier: db.getCacheMultiplier,
      spendTokens: db.spendTokens,
      spendStructuredTokens: db.spendStructuredTokens,
      insertMany: db.bulkInsertTransactions,
      updateBalance: db.updateBalance,
      findBalanceByUser: db.findBalanceByUser,
      createAutoRefillTransaction: db.createAutoRefillTransaction,
      upsertBalanceFields: db.upsertBalanceFields,
    },
  );

  /** `checkBalance` and the violation loggers can end the response themselves. */
  if (res.headersSent) {
    return;
  }
  if (result.status === 201) {
    return res.status(201).json(result.message);
  }
  return res.status(result.status).json({ error: result.error, code: result.code });
};

module.exports = CompactController;
