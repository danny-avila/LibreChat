// Import the necessary modules
const path = require('path');
const base = path.resolve(__dirname, '..', '..', '..', '..', 'api');
console.log(base);
//api/server/controllers/agents/demo.js
require('module-alias')({ base });
const connectDb = require('~/lib/db/connectDb');
const AgentClient = require('./client');

// Define the user and message options
const user = 'user123';
const parentMessageId = 'pmid123';
const conversationId = 'cid456';
const maxContextTokens = 200000;
const req = {
  user: { id: user },
};
const progressOptions = {
  res: {},
};

// Define the message options
const messageOptions = {
  user,
  parentMessageId,
  conversationId,
  progressOptions,
};

async function main() {
  await connectDb();
  const client = new AgentClient({ req, maxContextTokens });

  const text = 'Hello, this is a test message.';

  try {
    let response = await client.sendMessage(text, messageOptions);
    console.log('Response:', response);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

main();
