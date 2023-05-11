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
          author: 'user',
          content: 'Are my favorite movies based on a book series?'
        }
      ]
    }
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
  key.private_key,
  scopes
);

const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${key.project_id}/locations/us-central1/publishers/google/models/chat-bison:predict`;

(async () => {
  const res = await jwtClient.request({ url, method: 'POST', data});
  console.dir(res.data, {depth: null});
})();