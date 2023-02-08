const express = require('express');
const dbConnect = require('../models/dbConnect');
const { ask, titleConversation } = require('../app/chatgpt');
const { saveMessage, getMessages } = require('../models/Message');
const { saveConvo, getConvos, deleteConvos } = require('../models/Conversation');
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
  res.status(200).send(await getConvos());
});

app.get('/messages/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  res.status(200).send(await getMessages({ conversationId }));
});

app.post('/clear_convos', async (req, res) => {
  let filter = {};
  const { conversationId } = req.body.arg;
  if (!!conversationId) {
    filter = { conversationId };
  }

  try {
    const dbResponse = await deleteConvos(filter);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
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

  // res.write(`event: message\ndata: ${JSON.stringify('')}\n\n`);

  let i = 0;
  const progressCallback = async (partial) => {
    // console.log('partial', partial);
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

  try {
    let gptResponse = await ask(text, progressCallback, { parentMessageId, conversationId });
    if (!!parentMessageId) {
      gptResponse = { ...gptResponse, parentMessageId };
    } else {
      gptResponse.title = await titleConversation(text, gptResponse.text);
    }

    gptResponse.sender = 'GPT';
    await saveMessage(gptResponse);
    await saveConvo(gptResponse);

    res.write(`event: message\ndata: ${JSON.stringify(gptResponse)}\n\n`);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
