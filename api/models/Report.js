const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReportSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    reportType: {
      type: String,
      required: true,
      enum: ['room'],
    },
    accepted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const Report = mongoose.models.Report || mongoose.model('Report', ReportSchema);
module.exports = Report;
