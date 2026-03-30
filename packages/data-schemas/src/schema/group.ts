import { Schema } from 'mongoose';
import { IGroup, ITimeWindow } from '~/types';

// Time window sub-schema
const TimeWindowSchema = new Schema<ITimeWindow>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    windowType: {
      type: String,
      required: true,
      enum: ['daily', 'weekly', 'date_range', 'exception'],
    },
    startTime: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, // HH:MM format
    },
    endTime: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, // HH:MM format
    },
    daysOfWeek: {
      type: [Number],
      default: [],
      validate: {
        validator: function(arr: number[]) {
          return arr.every(day => day >= 0 && day <= 6);
        },
        message: 'Days of week must be numbers between 0-6 (Sunday-Saturday)',
      },
    },
    startDate: {
      type: Date,
      required: function(this: ITimeWindow) {
        return this.windowType === 'date_range';
      },
    },
    endDate: {
      type: Date,
      required: function(this: ITimeWindow) {
        return this.windowType === 'date_range';
      },
    },
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
  { 
    timestamps: true,
    _id: true,
  }
);

// Main Group schema
const groupSchema = new Schema<IGroup>(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      unique: true,
      trim: true,
      minlength: [2, 'Group name must be at least 2 characters'],
      maxlength: [50, 'Group name cannot exceed 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    // Embedded time windows for performance
    timeWindows: {
      type: [TimeWindowSchema],
      default: [],
    },
    // Metadata
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    // Statistics (denormalized for performance)
    memberCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { 
    timestamps: true,
    collection: 'groups',
  }
);

// Indexes
groupSchema.index({ name: 1 }, { unique: true });
groupSchema.index({ isActive: 1 });
groupSchema.index({ 'timeWindows.isActive': 1 });
groupSchema.index({ createdAt: -1 });

// Pre-save middleware to update memberCount
groupSchema.methods.updateMemberCount = async function() {
  const User = this.model('User');
  const count = await User.countDocuments({
    'groupMemberships.groupId': this._id,
  });
  this.memberCount = count;
  return this.save();
};

export default groupSchema;