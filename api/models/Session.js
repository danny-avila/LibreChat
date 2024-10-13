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
sessionSchema.methods.storeRefreshToken = async function (refreshToken, expiresIn, userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required to update refresh token');
    }
    if (!refreshToken) {
      throw new Error('Refresh token is required to update refresh token');
    }
    if (typeof expiresIn === 'undefined' || expiresIn === null || isNaN(expiresIn)) {
      throw new Error('Valid expiration time is required to update refresh token');
    }

    const expirationDate = new Date(expiresIn);
    if (isNaN(expirationDate.getTime())) {
      throw new Error('Invalid expiration date calculated from expiresIn');
    }

    const refreshTokenHash = await hashToken(refreshToken);

    let session = await mongoose.model('Session').findOne({ user: userId });
    if (!session) {
      session = new mongoose.model('Session')({
        user: userId,
        refreshTokenHash,
        expiration: expirationDate,
      });
    } else {
      session.refreshTokenHash = refreshTokenHash;
      session.expiration = expirationDate;
    }

    await session.save();
    return session;
  } catch (error) {
    logger.error('[storeRefreshToken] Error storing refresh token:', error);
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
