const { ApiKey, Provider } = require('~/db/models');
const { logger } = require('~/config');

// Get all API keys, optionally filtered by providerId
async function getApiKeys(req, res) {
  try {
    const { providerId } = req.query;
    const filter = {};
    if (providerId) {
      filter.providerId = providerId;
    }
    // TODO: Add filtering by userId if keys are user-specific and user is not admin
    const apiKeys = await ApiKey.find(filter).populate('providerId', 'name');
    res.status(200).json(apiKeys);
  } catch (error) {
    logger.error('[ApiKeyController] Error getting API keys:', error);
    res.status(500).json({ message: 'Error getting API keys' });
  }
}

// Create a new API key
async function createApiKey(req, res) {
  try {
    const { providerId, customName, value, userId } = req.body;

    if (!providerId || !customName || !value) {
      return res.status(400).json({ message: 'providerId, customName, and value are required' });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    // TODO: If keys are user-specific and user is not admin, set userId from req.user.id

    const newApiKey = new ApiKey({ providerId, customName, value, userId });
    await newApiKey.save();
    res.status(201).json(newApiKey);
  } catch (error) {
    logger.error('[ApiKeyController] Error creating API key:', error);
    // Consider specific error handling, e.g., for duplicate customName if that should be unique per provider/user
    res.status(500).json({ message: 'Error creating API key' });
  }
}

// Update an API key
async function updateApiKey(req, res) {
  try {
    const { apiKeyId } = req.params;
    const { customName, value } = req.body; // providerId and userId generally shouldn't be updated directly

    const updateData = {};
    if (customName) updateData.customName = customName;
    if (value) updateData.value = value;
    // Add other updatable fields as necessary

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No update fields provided' });
    }

    const updatedApiKey = await ApiKey.findByIdAndUpdate(
      apiKeyId,
      updateData,
      { new: true, runValidators: true },
    );

    if (!updatedApiKey) {
      return res.status(404).json({ message: 'API key not found' });
    }
    res.status(200).json(updatedApiKey);
  } catch (error) {
    logger.error('[ApiKeyController] Error updating API key:', error);
    res.status(500).json({ message: 'Error updating API key' });
  }
}

// Delete an API key
async function deleteApiKey(req, res) {
  try {
    const { apiKeyId } = req.params;
    const deletedApiKey = await ApiKey.findByIdAndDelete(apiKeyId);
    if (!deletedApiKey) {
      return res.status(404).json({ message: 'API key not found' });
    }
    res.status(200).json({ message: 'API key deleted successfully' });
  } catch (error) {
    logger.error('[ApiKeyController] Error deleting API key:', error);
    res.status(500).json({ message: 'Error deleting API key' });
  }
}

module.exports = {
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
};
