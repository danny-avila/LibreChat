const mongoose = require('mongoose');
const { logger } = require('~/config');

const major = [0, 0];
const minor = [0, 0];
const patch = [0, 5];

const configSchema = mongoose.Schema(
  {
    tag: {
      type: String,
      required: true,
      validate: {
        validator: function (tag) {
          const [part1, part2, part3] = tag.replace('v', '').split('.').map(Number);

          // Check if all parts are numbers
          if (isNaN(part1) || isNaN(part2) || isNaN(part3)) {
            return false;
          }

          // Check if all parts are within their respective ranges
          if (part1 < major[0] || part1 > major[1]) {
            return false;
          }
          if (part2 < minor[0] || part2 > minor[1]) {
            return false;
          }
          if (part3 < patch[0] || part3 > patch[1]) {
            return false;
          }
          return true;
        },
        message: 'Invalid tag value',
      },
    },
    searchEnabled: {
      type: Boolean,
      default: false,
    },
    usersEnabled: {
      type: Boolean,
      default: false,
    },
    startupCounts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Instance method
configSchema.methods.incrementCount = function () {
  this.startupCounts += 1;
};

// Static methods
configSchema.statics.findByTag = async function (tag) {
  return await this.findOne({ tag }).lean();
};

configSchema.statics.updateByTag = async function (tag, update) {
  return await this.findOneAndUpdate({ tag }, update, { new: true });
};

const Config = mongoose.models.Config || mongoose.model('Config', configSchema);

Config.on('index', (error) => {
  if (error) {
    logger.error(`Failed to create Config index ${error}`);
  }
});

module.exports = {
  getConfigs: async (filter) => {
    try {
      return await Config.find(filter).lean();
    } catch (error) {
      logger.error('Error getting configs', error);
      return { config: 'Error getting configs' };
    }
  },
  deleteConfigs: async (filter) => {
    try {
      return await Config.deleteMany(filter);
    } catch (error) {
      logger.error('Error deleting configs', error);
      return { config: 'Error deleting configs' };
    }
  },
};
