const { Provider, ApiKey, Model } = require('~/db/models');
const { logger } = require('~/config');
const { createFetch } = require('@librechat/api');

// Get all providers
async function getProviders(req, res) {
  try {
    const providers = await Provider.find({});
    res.status(200).json(providers);
  } catch (error) {
    logger.error('[ProviderController] Error getting providers:', error);
    res.status(500).json({ message: 'Error getting providers' });
  }
}

// Create a new provider
async function createProvider(req, res) {
  try {
    const { name, baseURL } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Provider name is required' });
    }
    const newProvider = new Provider({ name, baseURL });
    await newProvider.save();
    res.status(201).json(newProvider);
  } catch (error) {
    logger.error('[ProviderController] Error creating provider:', error);
    if (error.code === 11000) { // Duplicate key error
      return res.status(409).json({ message: 'Provider name must be unique' });
    }
    res.status(500).json({ message: 'Error creating provider' });
  }
}

// Update a provider
async function updateProvider(req, res) {
  try {
    const { providerId } = req.params;
    const { name, baseURL } = req.body;
    const updatedProvider = await Provider.findByIdAndUpdate(
      providerId,
      { name, baseURL },
      { new: true, runValidators: true },
    );
    if (!updatedProvider) {
      return res.status(404).json({ message: 'Provider not found' });
    }
    res.status(200).json(updatedProvider);
  } catch (error) {
    logger.error('[ProviderController] Error updating provider:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Provider name must be unique' });
    }
    res.status(500).json({ message: 'Error updating provider' });
  }
}

// Delete a provider
async function deleteProvider(req, res) {
  try {
    const { providerId } = req.params;
    // TODO: Consider what happens to APIKeys and Models when a provider is deleted.
    // Potentially cascade delete or prevent deletion if in use.
    const deletedProvider = await Provider.findByIdAndDelete(providerId);
    if (!deletedProvider) {
      return res.status(404).json({ message: 'Provider not found' });
    }
    res.status(200).json({ message: 'Provider deleted successfully' });
  } catch (error) {
    logger.error('[ProviderController] Error deleting provider:', error);
    res.status(500).json({ message: 'Error deleting provider' });
  }
}

module.exports = {
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  fetchModelsForProvider,
};

// Fetch models from a provider and save them
async function fetchModelsForProvider(req, res) {
  try {
    const { providerId } = req.params;
    const provider = await Provider.findById(providerId);

    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    if (!provider.baseURL) {
      return res.status(400).json({ message: 'Provider baseURL is not configured' });
    }

    // Find an API key for this provider.
    // This assumes one active key is sufficient. Logic might need to be more complex
    // if multiple keys exist or specific keys are needed for model fetching.
    const apiKey = await ApiKey.findOne({ providerId: provider._id });
    if (!apiKey || !apiKey.value) {
      return res.status(400).json({ message: 'API key for this provider is not configured or has no value' });
    }

    const modelsUrl = new URL('/v1/models', provider.baseURL).toString();
    const fetch = createFetch();

    logger.debug(`[ProviderController] Fetching models from ${modelsUrl}`);

    const response = await fetch(modelsUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey.value}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`[ProviderController] Error fetching models from ${provider.name}: ${response.status} ${response.statusText} - ${errorBody}`);
      return res.status(response.status).json({ message: `Error fetching models: ${errorBody}` });
    }

    const { data: modelsData } = await response.json();

    if (!modelsData || !Array.isArray(modelsData)) {
      return res.status(500).json({ message: 'Invalid model data format from provider' });
    }

    for (const modelInfo of modelsData) {
      await Model.findOneAndUpdate(
        { providerId: provider._id, modelId: modelInfo.id },
        { providerId: provider._id, modelId: modelInfo.id, name: modelInfo.name || modelInfo.id, ownedBy: modelInfo.owned_by, type: modelInfo.object === 'model' ? 'text' : modelInfo.object, fetchedAt: new Date() }, // Basic mapping, might need more detail
        { upsert: true, new: true, runValidators: true },
      );
    }

    res.status(200).json({ message: `Models fetched and updated for ${provider.name}` });
  } catch (error) {
    logger.error('[ProviderController] Error fetching models for provider:', error);
    res.status(500).json({ message: 'Error fetching models for provider' });
  }
}
