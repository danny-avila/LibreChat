const User = require('@librechat/backend/models/User');
const { Transaction } = require('@librechat/backend/models/Transaction');

async function addTokensByUserId(userId, amount) {
  // Validate the user
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('No user with that userId was found!');
  }

  // Create the transaction and update the balance
  const result = await Transaction.create({
    user: user._id,
    tokenType: 'credits',
    context: 'admin',
    rawAmount: +amount,
  });

  // Check the result
  if (!result.balance) {
    throw new Error('Something went wrong while updating the balance!');
  }

  return result.balance; // Return the new balance
}

module.exports = addTokensByUserId;
