// api/server/routes/contacts.js
const express = require('express');
const multer = require('multer');
const { requireJwtAuth } = require('~/server/middleware');
const {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  importContacts,
} = require('~/server/controllers/ContactController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

router.use(requireJwtAuth);

router.get('/', getContacts);
router.post('/', createContact);
router.post('/import', upload.single('file'), importContacts);
router.get('/:id', getContact);
router.put('/:id', updateContact);
router.delete('/:id', deleteContact);

module.exports = router;