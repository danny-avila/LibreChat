const express = require('express');
const { updateUserKey, deleteUserKey, getUserKeyExpiry } = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');
const configMiddleware = require('~/server/middleware/config/app');
const { validateUserBaseURL } = require('~/server/utils/validateBaseURL');

const router = express.Router();

router.put('/', requireJwtAuth, configMiddleware, async (req, res) => {
  if (req.body == null || typeof req.body !== 'object') {
    return res.status(400).send({ error: 'Invalid request body.' });
  }
  const { name, value, expiresAt } = req.body;

  if (req.config?.interfaceConfig?.blockPrivateUserBaseURL && typeof value === 'string') {
    const submittedBaseURL = extractBaseURL(value);
    if (submittedBaseURL) {
      try {
        await validateUserBaseURL(submittedBaseURL);
      } catch (err) {
        return res.status(400).send({ error: err.message });
      }
    }
  }

  await updateUserKey({ userId: req.user.id, name, value, expiresAt });
  res.status(201).send();
});

function extractBaseURL(value) {
  if (!value.startsWith('{')) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.baseURL === 'string' && parsed.baseURL.length > 0) {
      return parsed.baseURL;
    }
  } catch {
    return null;
  }
  return null;
}

router.delete('/:name', requireJwtAuth, async (req, res) => {
  const { name } = req.params;
  await deleteUserKey({ userId: req.user.id, name });
  res.status(204).send();
});

router.delete('/', requireJwtAuth, async (req, res) => {
  const { all } = req.query;

  if (all !== 'true') {
    return res.status(400).send({ error: 'Specify either all=true to delete.' });
  }

  await deleteUserKey({ userId: req.user.id, all: true });

  res.status(204).send();
});

router.get('/', requireJwtAuth, async (req, res) => {
  const { name } = req.query;
  const response = await getUserKeyExpiry({ userId: req.user.id, name });
  res.status(200).send(response);
});

module.exports = router;
