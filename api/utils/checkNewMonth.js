const { User } = require('~/models');

const currentDate = new Date();
const checkIfNewMonth = async () => {
  const currentMonth = currentDate.getMonth();

  // Check if current month is different than last checked
  if (currentMonth !== lastCheckedMonth) {
    console.log('New month!');
    await User.updateMany({ 'subscription.active': true }, { credits: { $inc: 2000 } });
    lastCheckedMonth = currentMonth;
  }
};
let lastCheckedMonth;

module.exports = {
  checkIfNewMonth,
};
