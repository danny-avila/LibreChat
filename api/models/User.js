const mongoose = require('mongoose');
const userSchema = require('./schema/userSchema.js');

userSchema.methods.toJSON = function () {
  return {
    id: this._id,
    provider: this.provider,
    email: this.email,
    name: this.name,
    username: this.username,
    avatar: this.avatar,
    role: this.role,
    emailVerified: this.emailVerified,
    plugins: this.plugins,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const User = mongoose.model('User', userSchema);

module.exports = User;
