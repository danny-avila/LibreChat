const mongoose = require('mongoose');
const { SystemRoles } = require('librechat-data-provider');

/**
 * @typedef {Object} MongoSession
 * @property {string} [refreshToken] - The refresh token
 */

/**
 * @typedef {Object} MongoUser
 * @property {ObjectId} [_id] - MongoDB Document ID
 * @property {string} [name] - The user's name
 * @property {string} [username] - The user's username, in lowercase
 * @property {string} email - The user's email address
 * @property {boolean} emailVerified - Whether the user's email is verified
 * @property {string} [password] - The user's password, trimmed with 8-128 characters
 * @property {string} [avatar] - The URL of the user's avatar
 * @property {string} provider - The provider of the user's account (e.g., 'local', 'google')
 * @property {string} [role='USER'] - The role of the user
 * @property {string} [googleId] - Optional Google ID for the user
 * @property {string} [facebookId] - Optional Facebook ID for the user
 * @property {string} [openidId] - Optional OpenID ID for the user
 * @property {string} [ldapId] - Optional LDAP ID for the user
 * @property {string} [githubId] - Optional GitHub ID for the user
 * @property {string} [discordId] - Optional Discord ID for the user
 * @property {Array} [plugins=[]] - List of plugins used by the user
 * @property {Array.<MongoSession>} [refreshToken] - List of sessions with refresh tokens
 * @property {Date} [expiresAt] - Optional expiration date of the file
 * @property {Date} [createdAt] - Date when the user was created (added by timestamps)
 * @property {Date} [updatedAt] - Date when the user was last updated (added by timestamps)
 */

/** @type {MongooseSchema<MongoSession>} */
const Session = mongoose.Schema({
  refreshToken: {
    type: String,
    default: '',
  },
});

/** @type {MongooseSchema<MongoUser>} */
const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
    username: {
      type: String,
      lowercase: true,
      default: '',
    },
    email: {
      type: String,
      required: [true, 'can\'t be blank'],
      lowercase: true,
      unique: true,
      match: [/\S+@\S+\.\S+/, 'is invalid'],
      index: true,
    },
    emailVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    password: {
      type: String,
      trim: true,
      minlength: 8,
      maxlength: 128,
    },
    avatar: {
      type: String,
      required: false,
    },
    provider: {
      type: String,
      required: true,
      default: 'local',
    },
    role: {
      type: String,
      default: SystemRoles.USER,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    openidId: {
      type: String,
      unique: true,
      sparse: true,
    },
    customOpenIdData: {
      type: Map,
      of: String
    },
    ldapId: {
      type: String,
      unique: true,
      sparse: true,
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    discordId: {
      type: String,
      unique: true,
      sparse: true,
    },
    plugins: {
      type: Array,
      default: [],
    },
    refreshToken: {
      type: [Session],
    },
    expiresAt: {
      type: Date,
      expires: 604800, // 7 days in seconds
    },
    termsAccepted: {
      type: Boolean,
      default: false,
    },
  },

  { timestamps: true },
);

module.exports = userSchema;
