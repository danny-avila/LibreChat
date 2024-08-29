const Balance = require('~/models/Balance');

async function balanceController(req, res) {

  const record = await Balance.findOne({ user: req.user.id }, 'tokenCredits').lean();

  const balance = record ? record.tokenCredits : 0;
  res.status(200).send('' + balance);
}

module.exports = balanceController;
