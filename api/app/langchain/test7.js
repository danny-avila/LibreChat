require('dotenv').config();
const axios = require('axios');

async function fetchRawText(url) {
  try {
    const response = await axios.get(url, { responseType: 'text' });
    return response.data;
  } catch (error) {
    console.error(`Error fetching raw text: ${error}`);
    return null;
  }
}

function createWolframAlphaURL(query) {
  const baseURL = 'https://www.wolframalpha.com/api/v1/llm-api';
  const encodedQuery = encodeURIComponent(query);
  const appId = process.env.WOLFRAM_APP_ID || '';
  if (!appId) {
    throw new Error('Missing WOLFRAM_APP_ID environment variable.');
  }
  
  const url = `${baseURL}?input=${encodedQuery}&appid=${appId}`;
  return url;
}

(async () => {
  try {
    const query = '10 densest elemental metals';
    const url = createWolframAlphaURL(query);

    console.log(url);
    const response = await fetchRawText(url);
    // const text = await response.text();
    if (response) {
      console.log('Response:', typeof response);
      console.log(response);
    } else {
      console.log('Failed to fetch');
    }
  } catch (error) {
    console.log(error);
  }
})();
