const Balance = require('~/models/Balance');

async function addBalanceController(req, res) {
  const newBalance = req.body.balance;

  if (typeof newBalance !== 'number') {
    return res.status(400).json({ message: 'Balance must be a number.' });
}

  try {
    const currentRecord = await Balance.findOne({ user: req.user.id }).lean();
    
console.log('currentRecord:' ,currentRecord)
    if (!currentRecord) {
      return res.status(404).json({ message: 'Balance record not found for the user.' });
    }
    const updatedBalance = currentRecord.tokenCredits + newBalance;
    console.log('updatedBalance:',updatedBalance)

    await Balance.updateOne({ user: req.user.id }, { tokenCredits: updatedBalance });

    return res
      .status(200)
      .json({ message: 'Balance updated successfully.', balance: updatedBalance });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
}

module.exports = addBalanceController;
