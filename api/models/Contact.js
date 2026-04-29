const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    company: {
      type: String,
      index: true, // important for search
    },
    role: {
      type: String,
    },
    email: {
      type: String,
       index: true,
    },
    notes: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, 
      default: {},
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);


ContactSchema.index({
  name: 'text',
  company: 'text',
  role: 'text',
  notes: 'text',
});

// module.exports = mongoose.model('Contact', ContactSchema);
module.exports =
  mongoose.models.Contact || mongoose.model('Contact', ContactSchema);