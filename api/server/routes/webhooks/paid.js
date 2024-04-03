const express = require('express');
const router = express.Router();

// Handling POST requests to the webhook endpoint
router.post('/', (req, res) => {
  // Verify the request
  // Process the data
  // Respond appropriately
  res.status(200).send('Webhook on /paid has been received and processed.');

  // Log the Body
});

module.exports = router;
