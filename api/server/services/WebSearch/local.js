const axios = require('axios');
const { logger } = require('@librechat/data-schemas');

const createLocalClient = ({ baseURL, timeoutMs }) => {
  return axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
};

const searchLocal = async ({ client, query, maxResults, safeSearch }) => {
  try {
    const response = await client.get('/search', {
      params: {
        q: query,
        max: maxResults,
        safe: safeSearch,
      },
    });

    return response.data;
  } catch (error) {
    logger.error('[WebSearch.local.search] Failed to query ws-local /search', error);
    throw new Error('Search service unavailable');
  }
};

const fetchLocal = async ({ client, urls, maxBytes }) => {
  try {
    const response = await client.post('/fetch', {
      urls,
      maxBytes,
    });

    return response.data;
  } catch (error) {
    logger.error('[WebSearch.local.fetch] Failed to query ws-local /fetch', error);
    throw new Error('Fetch service unavailable');
  }
};

const rerankLocal = async ({ client, query, docs }) => {
  try {
    const response = await client.post('/rerank', {
      query,
      docs,
    });

    return response.data;
  } catch (error) {
    logger.error('[WebSearch.local.rerank] Failed to query ws-local /rerank', error);
    throw new Error('Rerank service unavailable');
  }
};

module.exports = {
  createLocalClient,
  searchLocal,
  fetchLocal,
  rerankLocal,
};
