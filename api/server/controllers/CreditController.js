const { default: mongoose } = require('mongoose');
const { User, ConvoToken } = require('~/models');

const getUserCredits = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ credits: user.credits });
  } catch (err) {
    return res.status(500).json({ message: err });
  }
};

const getCreditUsageByWeek = async (req, res) => {
  const todayDateObj = new Date(req.query.date);
  const dayOfWeek = todayDateObj.getDay();
  const startOfWeek = new Date(todayDateObj.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
  const endOfWeek = new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000);

  try {
    const result = await ConvoToken.aggregate([
      {
        $match: {
          $and: [
            {
              user: new mongoose.Types.ObjectId(req.user.id),
            },
            {
              createdAt: { $gte: startOfWeek, $lte: endOfWeek },
            },
          ],
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%m/%d/%Y', date: '$createdAt' } },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          count: { $sum: 1 },
        },
      },
    ]);

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err });
  }
};

module.exports = {
  getCreditUsageByWeek,
  getUserCredits,
};
