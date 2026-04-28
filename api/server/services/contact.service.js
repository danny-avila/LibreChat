
const Contact = require('../../models/Contact');

exports.create = async (data) => {
  return await Contact.create(data);
};

exports.getAll = async () => {
  return await Contact.find();
};

exports.searchContacts = async (queryText) => {
  const search = String(queryText || '').trim();
  if (!search) {
    return [];
  }

  const projection = 'name company role email notes metadata';

  const textMatches = await Contact.find({
    $text: { $search: search },
  })
    .select(projection)
    .limit(10)
    .lean();

  if (textMatches.length > 0) {
    return textMatches;
  }

  return await Contact.find({
    $or: [
      { name: { $regex: search, $options: 'i' } },
      { company: { $regex: search, $options: 'i' } },
      { role: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { notes: { $regex: search, $options: 'i' } },
      { $expr: { $regexMatch: { input: { $toString: '$metadata' }, regex: search, options: 'i' } } },
    ],
  })
    .select(projection)
    .limit(10)
    .lean();
};