import { Schema } from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import { IUser, IGroupMembership, IEffectiveTimeWindow } from '~/types';

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

// Group membership sub-schema
const GroupMembershipSchema = new Schema<IGroupMembership>(
  {
    groupId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Group',
      required: true,
    },
    assignedAt: { 
      type: Date, 
      default: Date.now,
      required: true,
    },
    assignedBy: { 
      type: Schema.Types.ObjectId, 
      ref: 'User',
      required: true,
    },
  },
  { _id: false },
);

// Effective time window sub-schema (cached data)
const EffectiveTimeWindowSchema = new Schema<IEffectiveTimeWindow>(
  {
    groupId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Group',
      required: true,
    },
    groupName: { 
      type: String, 
      required: true,
    },
    windowType: {
      type: String,
      required: true,
      enum: ['daily', 'weekly', 'date_range', 'exception'],
    },
    startTime: { 
      type: String, 
      required: true,
    },
    endTime: { 
      type: String, 
      required: true,
    },
    daysOfWeek: {
      type: [Number],
      default: [],
    },
    startDate: Date,
    endDate: Date,
    timezone: { 
      type: String, 
      required: true, 
      default: 'UTC',
    },
    isActive: { 
      type: Boolean, 
      required: true, 
      default: true,
    },
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
    samlId: {
      type: String,
      unique: true,
      sparse: true,
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
    appleId: {
      type: String,
      unique: true,
      sparse: true,
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
    },
    backupCodes: {
      type: [BackupCodeSchema],
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
    // Time-based access control fields
    groupMemberships: {
      type: [GroupMembershipSchema],
      default: [],
    },
    effectiveTimeWindows: {
      type: [EffectiveTimeWindowSchema],
      default: [],
    },
    lastAccessValidation: {
      type: Date,
    },
  },
  { timestamps: true },
);

// Add indexes for group membership queries
userSchema.index({ 'groupMemberships.groupId': 1 });
userSchema.index({ 'groupMemberships.assignedAt': -1 });
userSchema.index({ lastAccessValidation: 1 });

export default userSchema;
