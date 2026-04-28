
const Contact = require('../../models/Contact');

exports.create = async (data) => {
  return await Contact.create(data);
};

exports.getAll = async () => {
  return await Contact.find();
};

exports.searchContacts = async (queryText) => {
  return await Contact.find({
    $text: { $search: queryText }
  }).limit(10); // (avoid sending too much data)
};