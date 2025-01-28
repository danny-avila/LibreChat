const mongoose = require('mongoose');

/** @type {MongooseSchema<Passkey>} */
const Passkey = mongoose.Schema({
  credentialID: {
    type: Buffer, // Stores binary data
    required: true,
    unique: true,
    index: true,
  },
  credentialPublicKey: {
    type: Buffer,
    required: true,
  },
  counter: {
    type: Number,
    required: true,
    default: 0,
  },
  transports: {
    type: [String], // e.g., ['usb', 'nfc']
    default: [],
  },
}, { _id: false });

module.exports = Passkey;