const Balance = require('~/models/Balance');

async function addBalanceController(req, res) {
  const newBalnce = req.body.balance;
  const { tokenCredits: balance = '' } =
    (await Balance.findOne({ user: req.user.id }, 'tokenCredits').lean()) ?? {};
  console.log(req.user);

  res.status(200).send(`your real balance is: ${balance} and you send this for balance: ${newBalnce} `);
}

module.exports = addBalanceController;
