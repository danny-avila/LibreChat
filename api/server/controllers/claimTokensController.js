// controllers/claimTokensController.js

const { User, Balance } = require('~/models');
const { logger } = require('~/config');

const claimTokens = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentTimestamp = new Date();

    if (
      !user.lastTokenClaimTimestamp ||
      currentTimestamp - user.lastTokenClaimTimestamp >= 24 * 60 * 60 * 1000
    ) {
      // User is eligible to claim tokens
      const balance = await Balance.findOne({ user: user._id });
      if (!balance) {
        return res.status(404).json({ message: 'User balance not found' });
      }

      balance.tokenCredits += 20000;
      await balance.save();

      user.lastTokenClaimTimestamp = currentTimestamp;
      await user.save();

      return res.status(200).json({ message: 'Tokens claimed successfully' });
    } else {
      // User is not eligible to claim tokens yet
      const remainingTime = 24 * 60 * 60 * 1000 - (currentTimestamp - user.lastTokenClaimTimestamp);
      const hours = Math.floor(remainingTime / (60 * 60 * 1000));
      const minutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((remainingTime % (60 * 1000)) / 1000);

      return res.status(400).json({
        message: `Not eligible to claim tokens yet. Please wait ${hours} hours, ${minutes} minutes, and ${seconds} seconds.`,
      });
    }
  } catch (err) {
    logger.error('[claimTokensController]', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  claimTokens,
};
