const express = require('express');
const { ask } = require('../app/chatgpt');
const dbConnect = require('../models/dbConnect');
const { saveMessage } = require('../models/Message');
const crypto = require('crypto');
const path = require('path');
const app = express();
const port = 3050;
const cors = require('cors');
app.use(cors());
app.use(express.json());

const projectPath = path.join(__dirname, '..');
app.use(express.static(path.join(projectPath, 'public')));

dbConnect().then((connection) => console.log('Connected to MongoDB'));

app.get('/', function (req, res) {
  console.log(path.join(projectPath, 'public', 'index.html'));
  res.sendFile(path.join(projectPath, 'public', 'index.html'));
});

app.post('/ask', async (req, res) => {
  console.log(req.body);
  const { text, parentMessageId, conversationId } = req.body;
  const userMessageId = crypto.randomUUID();

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  let i = 0;
  const progressCallback = (partial) => {
    // console.log('partial', partial);
    if (i === 0) {
      res.write(`event: message\ndata: ${JSON.stringify({ ...partial, initial: true })}\n\n`);
      i++;
    }
    const data = JSON.stringify({ ...partial, message: true });
    res.write(`event: message\ndata: ${data}\n\n`);
  };

  let gptResponse = await ask(text, progressCallback, { parentMessageId, conversationId });
  if (!!parentMessageId) {
    console.log('req parent vs res parent', parentMessageId, gptResponse.parentMessageId);
    gptResponse = { ...gptResponse, parentMessageId, sender: 'GPT' };
  }

  await saveMessage(gptResponse);

  res.write(`event: message\ndata: ${JSON.stringify(gptResponse)}\n\n`);
  res.end();
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
