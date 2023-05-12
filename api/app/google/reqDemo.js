const data = {
  instances: [
    {
      context:
        'My name is Ned. You are my personal assistant. My favorite movies are Lord of the Rings and Hobbit.',
      examples: [
        {
          input: { content: 'Who do you work for?' },
          output: { content: 'I work for Ned.' }
        },
        {
          input: { content: 'What do I like?' },
          output: { content: 'Ned likes watching movies.' }
        }
      ],
      messages: [
        {
          author: 'Human',
          content: 'Are my favorite movies based on a book series?'
        },
        {
          author: 'Assistant',
          content: "Yes, your favorite movies, The Lord of the Rings and The Hobbit, are based on book series of the same name by J.R.R. Tolkien. The Lord of the Rings trilogy is made up of the films The Fellowship of the Ring, The Two Towers, and The Return of the King."
        },
        {
          author: 'Human',
          content: 'Tell me a fun fact about The Lord of the Rings.'
        },
      ]
    },
  ],
  parameters: {
    temperature: 0.3,
    maxDecodeSteps: 200,
    topP: 0.8,
    topK: 40
  }
};
require('dotenv').config();
const {google} = require('googleapis');
const key = require('../../data/auth.json');
const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
const jwtClient = new google.auth.JWT(
  key.client_email,
  null,
  // key.private_key,
  process.env.GOOGLE_PRIVATE_KEY,
  scopes
);

const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${key.project_id}/locations/us-central1/publishers/google/models/chat-bison:predict`;

// jwtClient.authorize((err, tokens) => {
//   if (err) {
//     console.err(err);
//     return;
//   }
//   console.log('Access token:', tokens.access_token);
// });

(async () => {
  const res = await jwtClient.request({ url, method: 'POST', data});
  console.dir(res, {depth: null});
})();