const mongoose = require('mongoose');

const imageTransactionSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
      enum: [
        '/v1/flux-pro-1.1-ultra',
        '/v1/flux-pro-1.1',
        '/v1/flux-pro',
        '/v1/flux-dev',
        '/v1/flux-pro-1.1-ultra-finetuned',
        '/v1/flux-pro-finetuned',
      ],
    },
    cost: {
      type: Number,
      required: true,
    },
    imagePath: {
      type: String,
      required: function () {
        return this.status === 'success';
      },
      default: '',
    },
    metadata: {
      width: Number,
      height: Number,
      steps: Number,
      seed: Number,
      raw: Boolean,
      finetune_id: String,
      finetune_strength: Number,
      guidance: Number,
      safety_tolerance: Number,
    },
    status: {
      type: String,
      enum: ['success', 'error'],
      required: true,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = imageTransactionSchema;
