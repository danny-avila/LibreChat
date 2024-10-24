const { logger } = require('~/config');
const mongoose = require('mongoose');
const { Constants } = require('librechat-data-provider');
const Schema = mongoose.Schema;

/**
 * @typedef {Object} MongoPromptGroup
 * @property {ObjectId} [_id] - MongoDB Document ID
 * @property {string} name - The name of the prompt group
 * @property {ObjectId} author - The author of the prompt group
 * @property {ObjectId} [projectId=null] - The project ID of the prompt group
 * @property {ObjectId} [productionId=null] - The project ID of the prompt group
 * @property {string} authorName - The name of the author of the prompt group
 * @property {number} [numberOfGenerations=0] - Number of generations the prompt group has
 * @property {string} [oneliner=''] - Oneliner description of the prompt group
 * @property {string} [category=''] - Category of the prompt group
 * @property {string} [command] - Command for the prompt group
 * @property {Date} [createdAt] - Date when the prompt group was created (added by timestamps)
 * @property {Date} [updatedAt] - Date when the prompt group was last updated (added by timestamps)
 */

const promptGroupSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },
    numberOfGenerations: {
      type: Number,
      default: 0,
    },
    oneliner: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      default: '',
      index: true,
    },
    projectIds: {
      type: [Schema.Types.ObjectId],
      ref: 'Project',
      index: true,
    },
    productionId: {
      type: Schema.Types.ObjectId,
      ref: 'Prompt',
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    command: {
      type: String,
      index: true,
      validate: {
        validator: function (v) {
          return v === undefined || v === null || v === '' || /^[a-z0-9-]+$/.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid command. Only lowercase alphanumeric characters and highfins (') are allowed.`,
      },
      maxlength: [
        Constants.COMMANDS_MAX_LENGTH,
        `Command cannot be longer than ${Constants.COMMANDS_MAX_LENGTH} characters`,
      ],
    },
  },
  {
    timestamps: true,
  },
);

const PromptGroup = mongoose.model('PromptGroup', promptGroupSchema);

PromptGroup.on('PromptGroup', (error) => {
  if (error) {
    logger.error(`Failed to create PromptGroup index ${error}`);
  }
});

const promptSchema = new Schema(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'PromptGroup',
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'chat'],
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

const Prompt = mongoose.model('Prompt', promptSchema);

Prompt.on('index', (error) => {
  if (error) {
    logger.error(`Failed to create Prompt index ${error}`);
  }
});

promptSchema.index({ createdAt: 1, updatedAt: 1 });
promptGroupSchema.index({ createdAt: 1, updatedAt: 1 });

module.exports = { Prompt, PromptGroup };
