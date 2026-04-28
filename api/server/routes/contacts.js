const express = require('express');
const multer = require('multer');
const router = express.Router();
const Contact = require('../../models/Contact');

/** Multer: store file in memory as a Buffer (no disk write needed) */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max — enough for 1M row CSVs
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.match(/\.(csv)$/i)) {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  },
});

/** Core schema fields — every other column goes into metadata */
const SCHEMA_FIELDS = new Set(['name', 'company', 'role', 'email', 'notes']);
const REQUIRED_FIELDS = ['name', 'company', 'role', 'email', 'notes'];

/**
 * Parse a CSV buffer into an array of row objects.
 * Handles: quoted fields, commas inside quotes, CRLF line endings.
 */
function parseCSV(buffer) {
  const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  // Normalise headers: lowercase + underscores (e.g. "Funding Stage" → "funding_stage")
  const headers = parseLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
  );

  const rows = lines.slice(1).map((line, i) => {
    const values = parseLine(line);
    const obj = { _rowNumber: i + 2 }; // +2: header row is 1, data starts at 2
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? '';
    });
    return obj;
  });

  return { headers, rows };
}

// ---------------------------------------------------------------------------
// GET /api/contacts  — list contacts with optional search & pagination
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = search ? { $text: { $search: search } } : {};

    const [contacts, total] = await Promise.all([
      Contact.find(query)
        .select('name company role email notes -_id')
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Contact.countDocuments(query),
    ]);

    res.json({
      message: 'Contacts fetched',
      data: contacts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/contacts  — create a single contact
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { attributes, metadata, ...rest } = req.body;
    // Accept both `attributes` (assignment API spec) and `metadata` (internal schema name)
    const contactData = { ...rest, metadata: metadata || attributes || {} };
    if (contactData.email) {
      contactData.email = String(contactData.email).trim().toLowerCase();
      const existing = await Contact.findOne({ email: contactData.email }).select('_id').lean();
      if (existing) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }
    const contact = await Contact.create(contactData);
    res.status(201).json({ message: 'Contact created', data: contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/contacts/:id  — get a single contact by MongoDB _id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id).lean();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ data: contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/contacts/import/csv
// Bulk import contacts from a CSV file upload.
//
// Request: multipart/form-data with field "file" containing a .csv file
//
// CSV column rules:
//   - Recognised schema columns (name, company, role, email, notes) → stored directly
//   - Any other column (industry, location, funding_stage, interests, etc.) → stored in metadata{}
//   - Required core fields: name, company, role, email, notes
//
// Response:
//   { total, success, failed, errors }
// ---------------------------------------------------------------------------
router.post('/import/csv', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send a CSV using field name "file".' });
  }

  const { rows } = parseCSV(req.file.buffer);

  if (rows.length === 0) {
    return res.status(400).json({ error: 'CSV file is empty or has no data rows.' });
  }

  let success = 0;
  let failed = 0;
  const CHUNK_SIZE = 1000;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const docs = [];
    const emailsInChunk = new Set();

    for (const row of chunk) {
      const { _rowNumber, ...fields } = row;

      const missingRequired = REQUIRED_FIELDS.find(
        (field) => !fields[field] || String(fields[field]).trim() === '',
      );
      if (missingRequired) {
        failed++;
        continue;
      }

      // Split columns into core schema fields vs arbitrary metadata
      const coreData = {};
      const metadata = {};

      for (const [key, value] of Object.entries(fields)) {
        const val = String(value).trim();
        if (SCHEMA_FIELDS.has(key)) {
          if (val !== '') coreData[key] = val;
        } else if (val !== '') {
          metadata[key] = val; // industry, location, funding_stage, tags, etc.
        }
      }

      if (coreData.email) {
        coreData.email = String(coreData.email).trim().toLowerCase();
      }

      if (emailsInChunk.has(coreData.email)) {
        failed++;
        continue;
      }

      emailsInChunk.add(coreData.email);

      docs.push({ ...coreData, metadata, __rowNumber: _rowNumber });
    }

    if (docs.length === 0) continue;

    const existing = await Contact.find({ email: { $in: Array.from(emailsInChunk) } })
      .select('email')
      .lean();
    const existingEmails = new Set(existing.map((item) => item.email));
    const filteredDocs = docs.filter((doc) => {
      if (!existingEmails.has(doc.email)) return true;
      failed++;
      return false;
    });

    if (filteredDocs.length === 0) continue;

    const insertDocs = filteredDocs.map(({ __rowNumber, ...rest }) => rest);

    try {
      // ordered: false = insert all valid docs even if some fail (e.g. duplicate email)
      const result = await Contact.insertMany(insertDocs, { ordered: false, rawResult: true });
      const inserted = result.insertedCount ?? insertDocs.length;
      success += inserted;
    } catch (err) {
      // insertMany with ordered:false still throws on any write error
      // but result.nInserted tells us how many actually got in
      const inserted = err.result?.nInserted ?? 0;
      success += inserted;
      failed += insertDocs.length - inserted;
    }

    // Brief pause between chunks to avoid overwhelming MongoDB on huge imports
    if (i + CHUNK_SIZE < rows.length) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  res.status(200).json({
    message: 'Import complete',
    total: rows.length,
    success,
    failed,
  });
});

module.exports = router;