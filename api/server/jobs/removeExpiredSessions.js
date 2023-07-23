const cron = require('node-cron');
const Session = require('../../models/Session');

const removeExpiredSessions = async () => {
  try {
    const now = new Date();
    await Session.deleteMany({ expiration: { $lt: now } });
    console.log("Expired sessions removed successfully.");
  } catch (err) {
    console.error("Error deleting expired sessions:", err);
  }
};

cron.schedule('0 * * * *', removeExpiredSessions);
