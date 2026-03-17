const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    notes: {
      type: String,
    },
    attributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

contactSchema.index({ user: 1, createdAt: -1 });
contactSchema.index(
  { name: 'text', company: 'text', role: 'text', email: 'text', notes: 'text' },
  { weights: { name: 10, company: 5, role: 5, email: 3, notes: 1 }, name: 'contact_text_search' },
);

const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);

module.exports = {
  contactSchema,
  Contact,
};
