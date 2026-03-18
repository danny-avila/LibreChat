// api/server/controllers/ContactController.js
const { Readable } = require('stream');
const csvParser = require('csv-parser');
const Contact = require('~/db/Contact');
const { logger } = require('@librechat/data-schemas');

/** Convert Mongoose Map or object to plain JS object */
const normalizeAttributes = (contact) => {
  if (!contact) return contact;
  const obj = contact.toObject ? contact.toObject() : { ...contact };
  if (obj.attributes instanceof Map) {
    obj.attributes = Object.fromEntries(obj.attributes);
  } else if (obj.attributes && typeof obj.attributes === 'object') {
    obj.attributes = Object.fromEntries(Object.entries(obj.attributes));
  }
  return obj;
};

// GET /api/contacts?page=1&limit=20&search=foo
const getContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const search = req.query.search?.trim();

    const query = { userId };
    if (search) {
      query.$text = { $search: search };
    }

    const [rawContacts, total] = await Promise.all([
      Contact.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Contact.countDocuments(query),
    ]);

    const contacts = rawContacts.map((c) => {
      if (c.attributes && typeof c.attributes === 'object' && !(c.attributes instanceof Map)) {
        c.attributes = Object.fromEntries(Object.entries(c.attributes));
      }
      return c;
    });

    res.json({ contacts, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error('[ContactController] getContacts error:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
};

// GET /api/contacts/:id
const getContact = async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(normalizeAttributes(contact));
  } catch (err) {
    logger.error('[ContactController] getContact error:', err);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
};

// POST /api/contacts
const createContact = async (req, res) => {
  try {
    const { name, company, role, email, notes, attributes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const contact = await Contact.create({
      userId: req.user.id,
      name,
      company,
      role,
      email,
      notes,
      attributes: attributes || {},
    });

    res.status(201).json(normalizeAttributes(contact));
  } catch (err) {
    logger.error('[ContactController] createContact error:', err);
    res.status(500).json({ error: 'Failed to create contact' });
  }
};

// PUT /api/contacts/:id
const updateContact = async (req, res) => {
  try {
    const { name, company, role, email, notes, attributes } = req.body;
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { name, company, role, email, notes, attributes },
      { new: true, runValidators: true },
    );

    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(normalizeAttributes(contact));
  } catch (err) {
    logger.error('[ContactController] updateContact error:', err);
    res.status(500).json({ error: 'Failed to update contact' });
  }
};

// DELETE /api/contacts/:id
const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('[ContactController] deleteContact error:', err);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
};

// POST /api/contacts/import  (multipart CSV upload)
const importContacts = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const userId = req.user.id;
    const BATCH_SIZE = 500;
    let batch = [];
    let imported = 0;
    let errors = 0;

    const CORE_FIELDS = new Set(['name', 'company', 'role', 'email', 'notes']);

    await new Promise((resolve, reject) => {
      const stream = Readable.from(req.file.buffer);
      stream
        .pipe(csvParser())
        .on('data', (row) => {
          try {
            const name = row.name || row.Name || row.full_name || '';
            if (!name) { errors++; return; }

            const attributes = {};
            for (const [key, val] of Object.entries(row)) {
              const k = key.toLowerCase().trim();
              if (!CORE_FIELDS.has(k) && val) {
                attributes[key.trim()] = String(val).trim();
              }
            }

            batch.push({
              userId,
              name: String(name).trim(),
              company: String(row.company || row.Company || '').trim(),
              role: String(row.role || row.Role || row.title || row.Title || '').trim(),
              email: String(row.email || row.Email || '').trim(),
              notes: String(row.notes || row.Notes || '').trim(),
              attributes,
            });
          } catch {
            errors++;
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (batch.length > 0) {
      for (let i = 0; i < batch.length; i += BATCH_SIZE) {
        const chunk = batch.slice(i, i + BATCH_SIZE);
        await Contact.insertMany(chunk, { ordered: false });
        imported += chunk.length;
      }
    }

    res.json({ imported, errors, total: imported + errors });
  } catch (err) {
    logger.error('[ContactController] importContacts error:', err);
    res.status(500).json({ error: 'Failed to import contacts' });
  }
};

module.exports = {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  importContacts,
};