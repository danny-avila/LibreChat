const mongoose = require('mongoose');

const customGptSchema = mongoose.Schema({
  chatGptLabel: {
    type: String,
    required: true
  },
  promptPrefix: {
    type: String
  },
  value: {
    type: String,
    required: true
  },
  user: {
    type: String
  },
}, { timestamps: true });

const CustomGpt = mongoose.models.CustomGpt || mongoose.model('CustomGpt', customGptSchema);

const createCustomGpt = async ({ chatGptLabel, promptPrefix, value, user }) => {
  try {
    await CustomGpt.create({
      chatGptLabel,
      promptPrefix,
      value,
      user
    });
    return { chatGptLabel, promptPrefix, value };
  } catch (error) {
    console.error(error);
    return { customGpt: 'Error saving customGpt' };
  }
};

module.exports = {
  getCustomGpts: async (user, filter) => {
    try {
      return await CustomGpt.find({ ...filter, user }).exec();
    } catch (error) {
      console.error(error);
      return { customGpt: 'Error getting customGpts' };
    }
  },
  updateCustomGpt: async (user, { value, ...update }) => {
    try {
      const customGpt = await CustomGpt.findOne({ value, user }).exec();

      if (!customGpt) {
        return await createCustomGpt({ value, ...update, user });
      } else {
        return await CustomGpt.findOneAndUpdate({ value, user }, update, {
          new: true,
          upsert: true
        }).exec();
      }
    } catch (error) {
      console.log(error);
      return { message: 'Error updating customGpt' };
    }
  },
  updateByLabel: async (user, { prevLabel, ...update }) => {
    try {
      return await CustomGpt.findOneAndUpdate({ chatGptLabel: prevLabel, user }, update, {
        new: true,
        upsert: true
      }).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error updating customGpt' };
    }
  },
  deleteCustomGpts: async (user, filter) => {
    try {
      return await CustomGpt.deleteMany({ ...filter, user }).exec();
    } catch (error) {
      console.error(error);
      return { customGpt: 'Error deleting customGpts' };
    }
  }
};
