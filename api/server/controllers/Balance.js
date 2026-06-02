const { findBalanceByUser, getUserBudget } = require('~/models');

async function balanceController(req, res) {
  const balanceData = await findBalanceByUser(req.user.id);

  if (!balanceData) {
    return res.status(404).json({ error: 'Balance not found' });
  }

  const { _id: _, ...result } = balanceData;

  if (!result.autoRefillEnabled) {
    delete result.refillIntervalValue;
    delete result.refillIntervalUnit;
    delete result.lastRefill;
    delete result.refillAmount;
  }

  const { currentMonthSpend } = await getUserBudget(req.user.id);
  result.currentMonthSpend = currentMonthSpend;

  res.status(200).json(result);
}

module.exports = balanceController;
