const mongoose = require('mongoose');
// Note: In LibreChat, the Balance model is usually capital 'B'
const { Balance } = require('../models/Balance'); 

async function expireBalances() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to Ryan\'s Lab Database...');

    // Get the exact time right now
    const now = new Date();
    
    // Create the "Expiry Threshold" (Current Date minus 1 Calendar Month)
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // LOGIC: If a user's lastRefill is OLDER (<) than oneMonthAgo, they expire.
    const result = await Balance.updateMany(
      { 
        lastRefill: { $lt: oneMonthAgo }, // Specifically older than 1 calendar month
        tokenCredits: { $gt: 0 }          // Only bother with accounts that still have tokens
      },
      { 
        $set: { tokenCredits: 0 } 
      }
    );

    console.log(`[MONTHLY WIPE] Success: ${result.modifiedCount} users reached their 1-month limit and were reset to 0.`);
    process.exit(0);
  } catch (err) {
    console.error('[CRITICAL ERROR]', err);
    process.exit(1);
  }
}

expireBalances();
