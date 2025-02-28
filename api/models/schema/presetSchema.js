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
    ...conversationPreset,
    agentOptions: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

const Preset = mongoose.models.Preset || mongoose.model('Preset', presetSchema);

module.exports = Preset;
