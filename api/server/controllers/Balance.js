const Balance = require('~/models/Balance');
const { logger } = require('~/config');

async function balanceController(req, res) {

  const record = await Balance.findOne({ user: req.user.id }, 'tokenCredits').lean();

  const balance = record ? record.tokenCredits : 0;
  res.status(200).send('' + balance);
}

async function balanceUpdateController(req, res) {
  const { id, balance } = req.body;
  console.log('update balance', req.body);
  try {
    await Balance.updateOne({
      'user': id,
    }, {
      $set: {
        tokenCredits: balance,
      },
    }, { upsert: true });
    res.status(200).send(true);
  } catch (e) {
    logger.error('[BalanceUpdateController]', e);
    res.status(500).json(false);
  }

}

module.exports = {
  balanceController,
  balanceUpdateController,
};
