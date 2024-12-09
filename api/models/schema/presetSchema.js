const { logger } = require('~/config');
const mongoose = require('mongoose');
const { conversationPreset } = require('./defaults');
const presetSchema = mongoose.Schema(
  {
    presetId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: 'New Chat',
      meiliIndex: true,
    },
    user: {
      type: String,
      default: null,
    },
    defaultPreset: {
      type: Boolean,
    },
    order: {
      type: Number,
    },
    // google only
    examples: [{ type: mongoose.Schema.Types.Mixed }],
    ...conversationPreset,
    agentOptions: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

const Preset = mongoose.models.Preset || mongoose.model('Preset', presetSchema);

Preset.on('index', (error) => {
  if (error) {
    logger.error(`Failed to create Preset index ${error}`);
  }
});

module.exports = Preset;
