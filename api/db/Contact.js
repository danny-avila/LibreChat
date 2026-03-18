// api/db/Contact.js
const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true, default: '' },
    role: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    notes: { type: String, default: '' },
    attributes: {
      type: Map,
      of: String,
      default: {},
    },
  },
  { timestamps: true },
);

// Text index for full-text search across all important fields
contactSchema.index(
  { name: 'text', company: 'text', role: 'text', email: 'text', notes: 'text' },
  { name: 'contact_text_index' },
);

// Regular indexes for fast exact lookups
contactSchema.index({ userId: 1, company: 1 });
contactSchema.index({ userId: 1, name: 1 });

const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);

module.exports = Contact;