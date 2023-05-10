const mongoose = require('mongoose');

const promptSchema = mongoose.Schema({
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  prompt: {
    type: String,
    required: true,
    minlength: 10
  },
  category: {
    type: String,
    enum: ['general', 'fiction', 'non-fiction'],
    default: 'general'
  },
}, { timestamps: true });

const Prompt = mongoose.models.Prompt || mongoose.model('Prompt', promptSchema);

module.exports = {
  savePrompt: async ({ title, prompt }) => {
    try {
      await Prompt.create({
        title,
        prompt
      });
      return { title, prompt };
    } catch (error) {
      console.error(error);
      return { prompt: 'Error saving prompt' };
    }
  },
  getPrompts: async ({ page = 1, limit = 10, sort = '-createdAt', filter = {} }) => {
    try {
      const prompts = await Prompt.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec();
      const count = await Prompt.countDocuments(filter);
      return {
        prompts,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        totalPrompts: count
      };
    } catch (error) {
      console.error(error);
      return { prompt: 'Error getting prompts' };
    }
  },
  deletePrompts: async (filter) => {
    try {
      return await Prompt.deleteMany(filter).exec();
    } catch (error) {
      console.error(error);
      return { prompt: 'Error deleting prompts' };
    }
  }
}
