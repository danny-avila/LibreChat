const mongoose = require('mongoose');

const promptSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    category: {
      type: String,
    },
  },
  { timestamps: true },
);

const Prompt = mongoose.models.Prompt || mongoose.model('Prompt', promptSchema);

module.exports = {
  savePrompt: async ({ title, prompt }) => {
    try {
      await Prompt.create({
        title,
        prompt,
      });
      return { title, prompt };
    } catch (error) {
      console.error(error);
      return { prompt: 'Error saving prompt' };
    }
  },
  getPrompts: async (filter) => {
    try {
      return await Prompt.find(filter).lean();
    } catch (error) {
      console.error(error);
      return { prompt: 'Error getting prompts' };
    }
  },
  deletePrompts: async (filter) => {
    try {
      return await Prompt.deleteMany(filter).lean();
    } catch (error) {
      console.error(error);
      return { prompt: 'Error deleting prompts' };
    }
  },
};
