const Challenge = require('~/models/challengeStore');

class MongoChallengeStore {
  async get(userId) {
    try {
      const challenge = await Challenge.findOne({ userId }).lean().exec();
      return challenge ? challenge.challenge : undefined;
    } catch (error) {
      console.error(`❌ Error fetching challenge for userId ${userId}:`, error);
      return undefined;
    }
  }

  async save(userId, challenge) {
    try {
      await Challenge.findOneAndUpdate(
        { userId },
        { challenge, createdAt: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).exec();
    } catch (error) {
      console.error(`❌ Error saving challenge for userId ${userId}:`, error);
    }
  }

  async delete(userId) {
    try {
      await Challenge.deleteOne({ userId }).exec();
    } catch (error) {
      console.error(`❌ Error deleting challenge for userId ${userId}:`, error);
    }
  }
}

module.exports = MongoChallengeStore;