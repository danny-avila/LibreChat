const User = require('@librechat/backend/models/User');
const Transaction = require('@librechat/backend/models/Transaction');

async function addTokens(email, amount) {
  // Validate the email
  if (!email.includes('@')) {
    throw new Error('Invalid email address!');
  }

  // Validate the user
  const user = await User.findOne({ email }).lean();
  if (!user) {
    throw new Error('No user with that email was found!');
  }

  // Create the transaction and update the balance
  const result = await Transaction.create({
    user: user._id,
    tokenType: 'credits',
    context: 'admin',
    rawAmount: +amount,
  });

  // Check the result
  if (!result.tokenCredits) {
    throw new Error('Something went wrong while updating the balance!');
  }

  return result.tokenCredits; // Return the new balance
}

module.exports = addTokens;
