require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const askBing = async ({ text, onProgress, convo }) => {
  const { BingAIClient } = await import('@waylaidwanderer/chatgpt-api');

  const bingAIClient = new BingAIClient({
    // "_U" cookie from bing.com
    userToken: process.env.BING_TOKEN,
    // If the above doesn't work, provide all your cookies as a string instead
    // cookies: '',
    debug: false,
    cache: { store: new KeyvFile({ filename: './data/cache.json' }) },
    proxy: process.env.PROXY || null
  });

  let options = { onProgress };
  if (convo) {
    options = { ...options, ...convo };
  }

  if (options?.jailbreakConversationId == 'false') {
    options.jailbreakConversationId = false;
  }

  if (convo.toneStyle) {
    options.toneStyle = convo.toneStyle;
  }

  console.log('bing options', options);

  const res = await bingAIClient.sendMessage(text, options);

  return res;

  // Example response for reference
  // {
  //   conversationSignature: 'wwZ2GC/qRgEqP3VSNIhbPGwtno5RcuBhzZFASOM+Sxg=',
  //   conversationId: '51D|BingProd|026D3A4017554DE6C446798144B6337F4D47D5B76E62A31F31D0B1D0A95ED868',
  //   clientId: '914800201536527',
  //   invocationId: 1,
  //   conversationExpiryTime: '2023-02-15T21:48:46.2892088Z',
  //   response: 'Hello, this is Bing. Nice to meet you. 😊',
  //   details: {
  //     text: 'Hello, this is Bing. Nice to meet you. 😊',
  //     author: 'bot',
  //     createdAt: '2023-02-15T15:48:43.0631898+00:00',
  //     timestamp: '2023-02-15T15:48:43.0631898+00:00',
  //     messageId: '9d0c9a80-91b1-49ab-b9b1-b457dc3fe247',
  //     requestId: '5b252ef8-4f09-4c08-b6f5-4499d2e12fba',
  //     offense: 'None',
  //     adaptiveCards: [ [Object] ],
  //     sourceAttributions: [],
  //     feedback: { tag: null, updatedOn: null, type: 'None' },
  //     contentOrigin: 'DeepLeo',
  //     privacy: null,
  //     suggestedResponses: [ [Object], [Object], [Object] ]
  //   }
  // }
};

module.exports = { askBing };
