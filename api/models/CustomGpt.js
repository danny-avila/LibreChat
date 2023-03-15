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
}, { timestamps: true });

const CustomGpt = mongoose.models.CustomGpt || mongoose.model('CustomGpt', customGptSchema);

const createCustomGpt = async ({ chatGptLabel, promptPrefix, value }) => {
  try {
    await CustomGpt.create({
      chatGptLabel,
      promptPrefix,
      value
    });
    return { chatGptLabel, promptPrefix, value };
  } catch (error) {
    console.error(error);
    return { customGpt: 'Error saving customGpt' };
  }
};

module.exports = {
  getCustomGpts: async (filter) => {
    try {
      return await CustomGpt.find(filter).exec();
    } catch (error) {
      console.error(error);
      return { customGpt: 'Error getting customGpts' };
    }
  },
  updateCustomGpt: async ({ value, ...update }) => {
    try {
      const customGpt = await CustomGpt.findOne({ value }).exec();

      if (!customGpt) {
        return await createCustomGpt({ value, ...update });
      } else {
        return await CustomGpt.findOneAndUpdate({ value }, update, {
          new: true,
          upsert: true
        }).exec();
      }
    } catch (error) {
      console.log(error);
      return { message: 'Error updating customGpt' };
    }
  },
  updateByLabel: async ({ prevLabel, ...update }) => {
    try {
      return await CustomGpt.findOneAndUpdate({ chatGptLabel: prevLabel }, update, {
        new: true,
        upsert: true
      }).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error updating customGpt' };
    }
  },
  deleteCustomGpts: async (filter) => {
    try {
      return await CustomGpt.deleteMany(filter).exec();
    } catch (error) {
      console.error(error);
      return { customGpt: 'Error deleting customGpts' };
    }
  }
};
