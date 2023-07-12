console.log("rateLimit middleware executed")

const UserActivity = require('../models/UserActivity');

const rateLimit = async (req, res, next) => {
  const userId = req.user.id;
  const subscriptionStatus = req.user.subscriptionStatus; // Get user's subscription status
  const model = req.body.model;
  console.log(model);

  // Set rate limit based on subscription status
  let maxMessagesPerDay;
  if (subscriptionStatus === 'active') {
    maxMessagesPerDay = 100; // For example
  } else {
    maxMessagesPerDay = 25;
  }

  // Get today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  console.log(`Checking messages for user: ${userId} for date: ${today}`);
  
  let userActivity = await UserActivity.findOne({
    userId,
    date: { $gte: today },
  });
  
  if (!userActivity) {
    console.log(`No messages found for user: ${userId} for date: ${today}`);
    userActivity = new UserActivity({ userId });
  }
  
  console.log(`User: ${userId} message count: ${userActivity.messageCount}`);
  
  if (userActivity.messageCount >= maxMessagesPerDay) {
    console.log(`Rate limit exceeded for user: ${userId}`);
    return res.status(429).json({ text: `Rate limit exceeded. You can send ${maxMessagesPerDay} messages per day.` });
  }
  
  userActivity.messageCount += 1;
  await userActivity.save();
  
  console.log(`Message sent for user: ${userId}. Updated message count: ${userActivity.messageCount}`);
  
  next();
};

module.exports = rateLimit;
