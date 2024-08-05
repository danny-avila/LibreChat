const mongoose = require('mongoose');
const signPayload = require('~/server/services/signPayload');
const { hashToken } = require('~/server/utils/crypto');
const { logger } = require('~/config');

const { REFRESH_TOKEN_EXPIRY } = process.env ?? {};
const expires = eval(REFRESH_TOKEN_EXPIRY) ?? 1000 * 60 * 60 * 24 * 7;

const sessionSchema = mongoose.Schema({
  refreshTokenHash: {
    type: String,
    required: true,
  },
  expiration: {
    type: Date,
    required: true,
    expires: 0,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

sessionSchema.methods.generateRefreshToken = async function () {
  try {
    let expiresIn;
    if (this.expiration) {
      expiresIn = this.expiration.getTime();
    } else {
      expiresIn = Date.now() + expires;
      this.expiration = new Date(expiresIn);
    }

    const refreshToken = await signPayload({
      payload: { id: this.user },
      secret: process.env.JWT_REFRESH_SECRET,
      expirationTime: Math.floor((expiresIn - Date.now()) / 1000),
    });

    this.refreshTokenHash = await hashToken(refreshToken);

    await this.save();

    return refreshToken;
  } catch (error) {
    logger.error(
      'Error generating refresh token. Is a `JWT_REFRESH_SECRET` set in the .env file?\n\n',
      error,
    );
    throw error;
  }
};

sessionSchema.statics.deleteAllUserSessions = async function (userId) {
  try {
    if (!userId) {
      return;
    }
    const result = await this.deleteMany({ user: userId });
    if (result && result?.deletedCount > 0) {
      logger.debug(
        `[deleteAllUserSessions] Deleted ${result.deletedCount} sessions for user ${userId}.`,
      );
    }
  } catch (error) {
    logger.error('[deleteAllUserSessions] Error in deleting user sessions:', error);
    throw error;
  }
};

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
