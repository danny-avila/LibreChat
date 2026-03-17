const express = require('express');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const { requireJwtAuth } = require('~/server/middleware');
const {
  createContact,
  getContacts,
  getContact,
  updateContact,
  deleteContact,
  bulkInsertContacts,
  searchContacts,
} = require('~/models');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

router.use(requireJwtAuth);

const upload = multer({ dest: 'uploads/csv/' });

// GET /api/contacts/search?q=term - Retrieve contacts relevant to a query (extra credit)
router.get('/search', async (req, res) => {
  try {
    const { q = '', limit } = req.query;
    const parsedLimit = Math.min(Number(limit) || 20, 100);
    const contacts = await searchContacts(req.user.id, q, parsedLimit);
    res.status(200).json(contacts);
  } catch (error) {
    logger.error('Error searching contacts:', error);
    res.status(500).json({ error: 'Failed to search contacts' });
  }
});

// GET /api/contacts - List all contacts for user
router.get('/', async (req, res) => {
  try {
    const contacts = await getContacts({ user: req.user.id });
    res.status(200).json(contacts);
  } catch (error) {
    logger.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// GET /api/contacts/:id - Get a specific contact
router.get('/:id', async (req, res) => {
  try {
    const contact = await getContact({ _id: req.params.id, user: req.user.id });
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.status(200).json(contact);
  } catch (error) {
    logger.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// POST /api/contacts - Create a new contact
router.post('/', async (req, res) => {
  try {
    const data = { ...req.body, user: req.user.id };
    const newContact = await createContact(data);
    res.status(201).json(newContact);
  } catch (error) {
    logger.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/contacts/:id - Update a contact
router.put('/:id', async (req, res) => {
  try {
    const updatedContact = await updateContact({ _id: req.params.id, user: req.user.id }, req.body);
    if (!updatedContact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.status(200).json(updatedContact);
  } catch (error) {
    logger.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /api/contacts/:id - Delete a contact
router.delete('/:id', async (req, res) => {
  try {
    const deletedContact = await deleteContact({ _id: req.params.id, user: req.user.id });
    if (!deletedContact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// POST /api/contacts/import - Stream and parse CSV file to bulk insert contacts
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  let chunkCount = 0;
  const BATCH_SIZE = 1000;
  let totalImported = 0;

  try {
    if (!fs.existsSync('uploads/csv')) {
      fs.mkdirSync('uploads/csv', { recursive: true });
    }

    const stream = fs.createReadStream(req.file.path).pipe(csv());

    for await (const row of stream) {
      const contactData = {
        user: req.user.id,
        name: row.name || row.Name || row.NAME,
        company: row.company || row.Company || row.COMPANY,
        role: row.role || row.Role || row.ROLE,
        email: row.email || row.Email || row.EMAIL,
        notes: row.notes || row.Notes || row.NOTES,
        attributes: {},
      };

      if (!contactData.name) {
        continue;
      }

      // Map remaining columns to arbitrary attributes
      for (const key of Object.keys(row)) {
        if (!['name', 'company', 'role', 'email', 'notes'].includes(key.toLowerCase())) {
          contactData.attributes[key] = row[key];
        }
      }

      results.push(contactData);
      chunkCount++;

      if (chunkCount >= BATCH_SIZE) {
        stream.pause();
        try {
          await bulkInsertContacts(results);
          totalImported += results.length;
        } catch (dbError) {
          logger.error('Error inserting CSV batch:', dbError);
        }
        results.length = 0;
        chunkCount = 0;
        stream.resume();
      }
    }

    if (results.length > 0) {
      await bulkInsertContacts(results);
      totalImported += results.length;
    }

    fs.unlinkSync(req.file.path);

    res.status(200).json({ success: true, count: totalImported });
  } catch (error) {
    logger.error('Error processing CSV import:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to process CSV file' });
  }
});

module.exports = router;
