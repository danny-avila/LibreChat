const { Contact } = require('./schema/contactSchema');

/**
 * Creates a new contact for a user
 * @param {Object} data
 * @param {string} data.user - User ID
 * @param {string} data.name - Contact Name
 * @param {string} [data.company]
 * @param {string} [data.role]
 * @param {string} [data.email]
 * @param {string} [data.notes]
 * @param {Object} [data.attributes] - Arbitrary key-value pairs
 */
const createContact = async (data) => {
  return await Contact.create(data);
};

/**
 * Gets contacts based on a filter
 * @param {Object} filter
 */
const getContacts = async (filter) => {
  return await Contact.find(filter).sort({ createdAt: -1 }).lean();
};

/**
 * Gets a specific contact by ID and user
 * @param {Object} filter
 * @param {string} filter._id
 * @param {string} filter.user
 */
const getContact = async (filter) => {
  return await Contact.findOne(filter).lean();
};

/**
 * Updates a contact
 * @param {Object} filter
 * @param {Object} updateData
 */
const updateContact = async (filter, updateData) => {
  return await Contact.findOneAndUpdate(filter, updateData, { new: true }).lean();
};

/**
 * Deletes a contact
 * @param {Object} filter
 */
const deleteContact = async (filter) => {
  return await Contact.findOneAndDelete(filter).lean();
};

/**
 * Bulk insert contacts for CSV import
 * @param {Array<Object>} contacts
 */
const bulkInsertContacts = async (contacts) => {
  return await Contact.insertMany(contacts, { ordered: false });
};

/**
 * Search contacts by text query across core fields.
 * Uses MongoDB $text index when query is present; returns all for empty query.
 * @param {string} userId
 * @param {string} query
 * @param {number} [limit=20]
 * @returns {Promise<Array<Object>>}
 */
const searchContacts = async (userId, query, limit = 20) => {
  if (!query || !query.trim()) {
    return await Contact.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const trimmed = query.trim();

  const textResults = await Contact.find(
    { user: userId, $text: { $search: trimmed } },
    { score: { $meta: 'textScore' } },
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean();

  if (textResults.length > 0) {
    return textResults;
  }

  // Regex fallback for partial matches not caught by text index
  const regex = new RegExp(trimmed, 'i');
  return await Contact.find({
    user: userId,
    $or: [
      { name: regex },
      { company: regex },
      { role: regex },
      { email: regex },
      { notes: regex },
    ],
  })
    .limit(limit)
    .lean();
};

module.exports = {
  createContact,
  getContacts,
  getContact,
  updateContact,
  deleteContact,
  bulkInsertContacts,
  searchContacts,
};
