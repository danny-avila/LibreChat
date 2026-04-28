
const contactService = require('../services/contact.service');

exports.createContact = async (req, res) => {
  try {
    const contact = await contactService.create(req.body);
    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};