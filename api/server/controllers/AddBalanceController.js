const Balance = require('~/models/Balance');

async function addBalanceController(req, res) {
  const newBalance = req.body.balance;
  const userId = req.body.id;

  if (typeof newBalance !== 'number') {
    return res.status(400).json({ message: 'Balance must be a number.' });
  }

  try {
    const currentRecord = await Balance.findOne({ user: userId }).lean();
    let updatedBalance = 0;
    if (!currentRecord) {
      updatedBalance = newBalance;
      await Balance.create({
        user: userId,
        tokenCredits: updatedBalance,
      });
    } else {
      updatedBalance = currentRecord.tokenCredits + newBalance;
      await Balance.updateOne({ user: userId }, { tokenCredits: updatedBalance });
    }

    return res
      .status(200)
      .json({ message: 'Balance updated successfully.', balance: updatedBalance });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
}

module.exports = addBalanceController;
