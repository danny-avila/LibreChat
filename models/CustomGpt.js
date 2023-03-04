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
  created: {
    type: Date,
    default: Date.now
  }
});

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
  // updateCustomGpt: async ({ _id, ...update }) => {
  //   try {
  //     console.log('updateCustomGpt', _id, update);
  //     return await CustomGpt.findOneAndUpdate({ _id }, update, {
  //       new: true,
  //       upsert: true
  //     }).exec();
  //   } catch (error) {
  //     console.log(error);
  //     return { message: 'Error updating customGpt' };
  //   }
  // },
  updateCustomGpt: async ({ value, ...update }) => {
    try {
      console.log('updateCustomGpt', value, update);

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
  deleteCustomGpts: async (filter) => {
    try {
      return await CustomGpt.deleteMany(filter).exec();
    } catch (error) {
      console.error(error);
      return { customGpt: 'Error deleting customGpts' };
    }
  }
};
