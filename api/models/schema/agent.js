const mongoose = require('mongoose');

const agentSchema = mongoose.Schema(
  {
    id: {
      type: String,
      index: true,
      required: true,
    },
    name: {
      type: String,
    },
    description: {
      type: String,
    },
    instructions: {
      type: String,
    },
    avatar: {
      type: {
        filepath: String,
        source: String,
      },
      default: undefined,
    },
    provider: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    model_parameters: {
      type: Object,
    },
    access_level: {
      type: Number,
    },
    tools: {
      type: [String],
      default: undefined,
    },
    tool_kwargs: {
      type: [{ type: mongoose.Schema.Types.Mixed }],
    },
    file_ids: {
      type: [String],
      default: undefined,
    },
    actions: {
      type: [String],
      default: undefined,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isCollaborative: {
      type: Boolean,
      default: undefined,
    },
    conversation_starters: {
      type: [String],
      default: [],
    },
    projectIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Project',
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = agentSchema;
