const { maybeAutoRefill } = require('@librechat/api');
const { findBalanceByUser, createAutoRefillTransaction } = require('~/models');

async function balanceController(req, res) {
  const balanceLocals = res.locals || {};

  if (balanceLocals.balanceConfigEnabled === false) {
    return res.sendStatus(204);
  }

  const balanceData = balanceLocals.balanceData ?? (await findBalanceByUser(req.user.id));

  if (!balanceData) {
    return res.status(404).json({ error: 'Balance not found' });
  }

  const { _id: _, ...result } = balanceData;

  if (!result.autoRefillEnabled) {
    delete result.refillIntervalValue;
    delete result.refillIntervalUnit;
    delete result.lastRefill;
    delete result.refillAmount;
    return res.status(200).json(result);
  }

  result.tokenCredits = await maybeAutoRefill({
    user: req.user.id,
    record: result,
    deps: { createAutoRefillTransaction },
  });

  res.status(200).json(result);
}

module.exports = balanceController;
