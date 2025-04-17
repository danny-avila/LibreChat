const mongoose = require('mongoose');

const sandboxSchema = new mongoose.Schema({
  sandboxId: { type: String, required: true, unique: true },
  sessionId: { type: String, required: true },
  userId: { type: String, required: true },
  expiredAt: { type: Date, required: true }, // Дата закінчення дії
}, { timestamps: true });

sandboxSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });

const Sandbox = mongoose.model('Sandbox', sandboxSchema);

module.exports = Sandbox;
