const express = require('express');
const { ask, titleConversation } = require('../app/chatgpt');
const dbConnect = require('../models/dbConnect');
const { saveMessage } = require('../models/Message');
const { saveConversation, getConversations } = require('../models/Conversation');
const crypto = require('crypto');
const path = require('path');
const cors = require('cors');
const app = express();
const port = 3050;
app.use(cors());
app.use(express.json());

const projectPath = path.join(__dirname, '..');
app.use(express.static(path.join(projectPath, 'public')));

dbConnect().then((connection) => console.log('Connected to MongoDB'));

app.get('/', function (req, res) {
  console.log(path.join(projectPath, 'public', 'index.html'));
  res.sendFile(path.join(projectPath, 'public', 'index.html'));
});

app.get('/convos', async (req, res) => {
  res.status(200).send(await getConversations());
});

app.get('/messages', async (req, res) => {
  res.status(200).send(await getConversations());
});

app.post('/ask', async (req, res) => {
  console.log(req.body);
  const { text, parentMessageId, conversationId } = req.body;
  const userMessageId = crypto.randomUUID();
  let userMessage = { id: userMessageId, sender: 'User', text };

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  let i = 0;
  const progressCallback = async (partial) => { // console.log('partial', partial);
    if (i === 0) {
      userMessage.parentMessageId = parentMessageId ? parentMessageId : partial.id;
      userMessage.conversationId = conversationId ? conversationId : partial.conversationId;
      await saveMessage(userMessage);
      res.write(`event: message\ndata: ${JSON.stringify({ ...partial, initial: true })}\n\n`);
      i++;
    }
    const data = JSON.stringify({ ...partial, message: true });
    res.write(`event: message\ndata: ${data}\n\n`);
  };

  let gptResponse = await ask(text, progressCallback, { parentMessageId, conversationId });
  if (!!parentMessageId) {
    // console.log('req parent vs res parent', parentMessageId, gptResponse.parentMessageId);
    gptResponse = { ...gptResponse, parentMessageId };
  } else {
    gptResponse.title = await titleConversation(text, gptResponse.text);
  }

  gptResponse.sender = 'GPT';
  await saveMessage(gptResponse);
  await saveConversation(gptResponse);

  res.write(`event: message\ndata: ${JSON.stringify(gptResponse)}\n\n`);
  res.end();
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
