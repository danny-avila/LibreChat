const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema({
  name: String,
  company: String,
  role: String,
  email: String,
  fields: Object, // flexible extra fields
});

module.exports = mongoose.model("Contact", ContactSchema);