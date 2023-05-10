const mongoose = require('mongoose');

const MAJOR_RANGE = [0, 0];
const MINOR_RANGE = [0, 0];
const PATCH_RANGE = [0, 5];

const configSchema = mongoose.Schema(
  {
    tag: {
      type: String,
      required: true,
      validate: {
        validator: function (tag) {
          const [part1, part2, part3] = tag.replace('v', '').split('.').map(Number);

          if (isNaN(part1) || isNaN(part2) || isNaN(part3)) {
            return false;
          }

          if (part1 < MAJOR_RANGE[0] || part1 > MAJOR_RANGE[1]) {
            return false;
          }

          if (part2 < MINOR_RANGE[0] || part2 > MINOR_RANGE[1]) {
            return false;
          }

          if (part3 < PATCH_RANGE[0] || part3 > PATCH_RANGE[1]) {
            return false;
          }

          return true;
        },
        message: 'Invalid tag value'
      }
    },
    searchEnabled: {
      type: Boolean,
      default: false
    },
    usersEnabled: {
      type: Boolean,
      default: false
    },
    startupCounts: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

configSchema.methods.incrementCount = function () {
  this.startupCounts += 1;
};

configSchema.statics.findByTag = async function (tag) {
  try {
    return await this.findOne({ tag });
  } catch (error) {
    console.error(error);
    throw new Error('Error finding config by tag');
  }
};

configSchema.statics.updateByTag = async function (tag, update) {
  try {
    return await this.findOneAndUpdate({ tag }, update, { new: true });
  } catch (error) {
    console.error(error);
    throw new Error('Error updating config by tag');
  }
};

const Config = mongoose.models.Config || mongoose.model('Config', configSchema);

module.exports = {
  getConfigs: async (filter) => {
    try {
      return await Config.find(filter).exec();
    } catch (error) {
      console.error(error);
      throw new Error('Error getting configs');
    }
  },
  deleteConfigs: async (filter) => {
    try {
      return await Config.deleteMany(filter).exec();
    } catch (error) {
      console.error(error);
      throw new Error('Error deleting configs');
    }
  }
};
