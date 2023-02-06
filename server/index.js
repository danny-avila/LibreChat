const path = require('path');
const express = require('express');
const { ask } = require('../app/chatgpt');
const app = express();
const port = 3050;
const cors = require('cors');
app.use(cors());
app.use(express.json());

const projectPath = path.join(__dirname, '..');
app.use(express.static(path.join(projectPath, 'public')));

app.get('/', function (req, res) {
  console.log(path.join(projectPath, 'public', 'index.html'));
  res.sendFile(path.join(projectPath, 'public', 'index.html'));
});

app.post('/ask', async (req, res) => {
  console.log(req.body);
  const { text, parentMessageId, conversationId } = req.body;

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
    const data = JSON.stringify({...partial, message: true });
    res.write(`event: message\ndata: ${data}\n\n`);
  };

  const gptResponse = await ask(text, progressCallback, { parentMessageId, conversationId });
  res.write(`event: message\ndata: ${JSON.stringify(gptResponse)}\n\n`);
  res.end();
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
