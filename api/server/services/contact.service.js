
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
  const normalized = search.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const stopwords = new Set([
    'which',
    'who',
    'what',
    'where',
    'when',
    'why',
    'how',
    'are',
    'is',
    'the',
    'a',
    'an',
    'of',
    'in',
    'to',
    'for',
    'and',
    'with',
    'our',
    'your',
    'contacts',
    'from',
    'working',
    'works',
    'work',
    'has',
    'have',
    'about',
    'know',
    'known',
  ]);
  const keywords = normalized
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stopwords.has(word))
    .slice(0, 8);
  const keywordPattern = keywords.length ? keywords.join('|') : search;
  const keywordRegex = new RegExp(keywordPattern, 'i');

  try {
    const textMatches = await Contact.find({
      $text: { $search: search },
    })
      .select(projection)
      .limit(10)
      .lean();

    if (textMatches.length > 0) {
      return textMatches;
    }
  } catch (err) {
    // Fall back to regex search when text index is unavailable
  }

  const regexMatches = await Contact.find({
    $or: [
      { name: { $regex: keywordRegex } },
      { company: { $regex: keywordRegex } },
      { role: { $regex: keywordRegex } },
      { email: { $regex: keywordRegex } },
      { notes: { $regex: keywordRegex } },
      { 'metadata.metadata': { $regex: keywordRegex } },
      {
        $expr: {
          $regexMatch: {
            input: {
              $convert: {
                input: '$metadata',
                to: 'string',
                onError: '',
                onNull: '',
              },
            },
            regex: keywordPattern,
            options: 'i',
          },
        },
      },
    ],
  })
    .select(projection)
    .limit(10)
    .lean();
  if (regexMatches.length > 0) {
    return regexMatches;
  }

  const candidates = await Contact.find()
    .select(projection)
    .limit(200)
    .lean();

  if (keywords.length === 0) {
    return [];
  }

  const matches = [];
  for (const contact of candidates) {
    let metadataText = '';
    if (contact.metadata && typeof contact.metadata === 'object') {
      if (typeof contact.metadata.metadata === 'string') {
        metadataText = contact.metadata.metadata;
      } else {
        metadataText = JSON.stringify(contact.metadata);
      }
    } else if (typeof contact.metadata === 'string') {
      metadataText = contact.metadata;
    }

    const haystack = [
      contact.name,
      contact.company,
      contact.role,
      contact.email,
      contact.notes,
      metadataText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/_/g, ' ');

    if (keywords.some((keyword) => haystack.includes(keyword))) {
      matches.push(contact);
      if (matches.length >= 10) {
        break;
      }
    }
  }

  return matches;
};