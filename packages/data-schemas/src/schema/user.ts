import { Schema } from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import { IUser } from '~/types';

// Session sub-schema
const SessionSchema = new Schema(
  {
    refreshToken: {
      type: String,
      default: '',
    },
  },
  { _id: false },
);

// Backup code sub-schema
const BackupCodeSchema = new Schema(
  {
    codeHash: { type: String, required: true },
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
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
      required: [true, "can't be blank"],
      lowercase: true,
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
      select: false,
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
    },
    facebookId: {
      type: String,
    },
    openidId: {
      type: String,
    },
    samlId: {
      type: String,
    },
    ldapId: {
      type: String,
    },
    githubId: {
      type: String,
    },
    discordId: {
      type: String,
    },
    appleId: {
      type: String,
    },
    plugins: {
      type: Array,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    totpSecret: {
      type: String,
      select: false,
    },
    backupCodes: {
      type: [BackupCodeSchema],
      select: false,
    },
    refreshToken: {
      type: [SessionSchema],
    },
    expiresAt: {
      type: Date,
      expires: 604800, // 7 days in seconds
    },
    termsAccepted: {
      type: Boolean,
      default: false,
    },
    personalization: {
      type: {
        memories: {
          type: Boolean,
          default: true,
        },
      },
      default: {},
    },
    favorites: {
      type: [
        {
          _id: false,
          agentId: String, // for agent
          model: String, // for model
          endpoint: String, // for model
        },
      ],
      default: [],
    },
    /** Field for external source identification (for consistency with TPrincipal schema) */
    idOnTheSource: {
      type: String,
      sparse: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

userSchema.index({ email: 1, tenantId: 1 }, { unique: true });

const oAuthIdFields = [
  'googleId',
  'facebookId',
  'openidId',
  'samlId',
  'ldapId',
  'githubId',
  'discordId',
  'appleId',
] as const;

for (const field of oAuthIdFields) {
  userSchema.index(
    { [field]: 1, tenantId: 1 },
    { unique: true, partialFilterExpression: { [field]: { $exists: true } } },
  );
}

export default userSchema;
