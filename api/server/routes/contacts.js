const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const router = express.Router();
const { createContactsService } = require('@librechat/api');

const contactsService = createContactsService(mongoose);
const { Contact } = contactsService;

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

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter((tag) => tag !== '');
  }

  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');
  }

  return [];
}

function normalizeContactInput(body) {
  const { attributes, metadata, tags, ...rest } = body;

  return {
    ...rest,
    tags: normalizeTags(tags),
    metadata: metadata || attributes || {},
  };
}

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
    const result = await contactsService.listContacts({
      search: search ? String(search) : undefined,
      page: Number(page),
      limit: Number(limit),
    });

    res.json({ message: 'Contacts fetched', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/contacts  — create a single contact
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const contactData = normalizeContactInput(req.body);
    const contact = await contactsService.createContact(contactData);
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
    const contact = await contactsService.getContactById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ data: contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/contacts/:id  — edit an existing contact
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  try {
    const updated = await contactsService.updateContact(req.params.id, normalizeContactInput(req.body));
    if (!updated) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact updated', data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/contacts/:id  — soft delete a contact
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await contactsService.deleteContact(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact deleted', data: deleted });
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

router.get('/:id/ai-summary', async (req, res) => {
  try {
    const contact = await contactsService.getContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
 
    // Build a structured block of contact facts so the AI has clean data
    const lines = [];
    lines.push(`Name: ${contact.name}`);
    if (contact.company) lines.push(`Company: ${contact.company}`);
    if (contact.role)    lines.push(`Role: ${contact.role}`);
    if (contact.email)   lines.push(`Email: ${contact.email}`);
    if (contact.phone)   lines.push(`Phone: ${contact.phone}`);
    if (contact.tags && contact.tags.length > 0) {
      lines.push(`Tags: ${contact.tags.join(', ')}`);
    }
    if (contact.notes)   lines.push(`Notes: ${contact.notes}`);
 
    // Extra metadata fields (industry, funding_stage, etc.)
    if (contact.metadata && typeof contact.metadata === 'object') {
      for (const [key, value] of Object.entries(contact.metadata)) {
        if (value !== null && value !== undefined && value !== '') {
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          lines.push(`${label}: ${value}`);
        }
      }
    }
 
    const contactBlock = lines.join('\n');
 
    // This is the exact message that gets auto-submitted to the AI on /c/new
    const prompt =
      `I am looking at a contact in my CRM. Here are their full details:\n\n` +
      `${contactBlock}\n\n` +
      `Please do the following:\n` +
      `1. Give me a structured summary of who this person is based on the information above.\n` +
      `2. Highlight anything noteworthy (their seniority, company context, any relevant notes).\n` +
      `3. Suggest 2-3 concrete next steps I could take to engage with or follow up with this contact.\n` +
      `4. Finally, ask me if there is anything specific I would like to know or do regarding this contact.`;
 
    res.json({ prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ---------------------------------------------------------------------------
// GET /api/contacts/:id/ai-summary-stream
//
// Streams an AI-generated contact summary as Server-Sent Events (SSE).
// The frontend reads the stream and renders tokens as they arrive.
//
// IMPORTANT: Paste this block ABOVE the existing router.get('/:id', ...) route
// in api/server/routes/contacts.js, otherwise Express will try to find a
// contact whose _id is literally "ai-summary-stream".
//
// This route uses the Anthropic SDK which is already a dependency of LibreChat.
// It reads ANTHROPIC_API_KEY from process.env (already set in your .env).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /api/contacts/:id/ai-summary-stream
//
// Paste this ABOVE router.get('/:id', ...) in api/server/routes/contacts.js
// ---------------------------------------------------------------------------

const Anthropic = require('@anthropic-ai/sdk');

router.get('/:id/ai-summary-stream', async (req, res) => {
  try {
    const contact = await contactsService.getContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const lines = [];
    lines.push(`Name: ${contact.name}`);
    if (contact.company) lines.push(`Company: ${contact.company}`);
    if (contact.role)    lines.push(`Role: ${contact.role}`);
    if (contact.email)   lines.push(`Email: ${contact.email}`);
    if (contact.phone)   lines.push(`Phone: ${contact.phone}`);
    if (contact.tags && contact.tags.length > 0) {
      lines.push(`Tags: ${contact.tags.join(', ')}`);
    }
    if (contact.notes) lines.push(`Notes: ${contact.notes}`);

    if (contact.metadata && typeof contact.metadata === 'object') {
      for (const [key, value] of Object.entries(contact.metadata)) {
        if (value !== null && value !== undefined && value !== '') {
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          lines.push(`${label}: ${value}`);
        }
      }
    }

    const contactBlock = lines.join('\n');

    const userPrompt =
      `Here is a contact from my CRM:\n\n${contactBlock}\n\n` +
      `Please:\n` +
      `1. Give a brief structured summary of who this person is.\n` +
      `2. Highlight anything noteworthy (seniority, company context, notes).\n` +
      `3. Suggest 2-3 concrete next steps to engage with this contact.\n` +
      `4. End by asking if there is anything specific I would like to know.`;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if present
    res.flushHeaders();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userPrompt }],
    });

    stream.on('text', (text) => {
      // JSON-encode the chunk so newlines inside AI text are safely transported
      // as a single SSE data line. Frontend JSON.parses it back.
      res.write(`data: ${JSON.stringify(text)}\n\n`);
    });

    stream.on('finalMessage', () => {
      res.write('data: [DONE]\n\n');
      res.end();
    });

    stream.on('error', (err) => {
      console.error('Anthropic stream error:', err);
      res.write('data: [DONE]\n\n');
      res.end();
    });

    req.on('close', () => {
      try { stream.abort?.(); } catch (_) {}
    });

  } catch (err) {
    console.error('ai-summary-stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});
module.exports = router;