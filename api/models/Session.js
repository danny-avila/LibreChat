const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const sessionSchema = mongoose.Schema({
  refreshTokenHash: {
    type: String,
    required: true,
  },
  expiration: {
    type: Date,
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
});

sessionSchema.methods.generateRefreshToken = async function () {
  try {
    let expiresIn;
    if (this.expiration) {
      expiresIn = this.expiration.getTime();
    } else {
      expiresIn = Date.now() + eval(process.env.REFRESH_TOKEN_EXPIRY);
      this.expiration = new Date(expiresIn);
    }

    const refreshToken = jwt.sign(
      {
        id: this.user,
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn:  Math.floor((expiresIn - Date.now()) / 1000) }
    );

    const hash = crypto.createHash('sha256');
    this.refreshTokenHash = hash.update(refreshToken).digest('hex');

    await this.save();

    return refreshToken;
  } catch (error) {
    console.error('Error generating refresh token: ', error);
    throw error;
  }
};

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
