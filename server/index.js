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

app.post('/ask', (req, res) => {
  console.log(req.body, 'we in here');

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin':'*',
    'X-Accel-Buffering':'no'
  });
  res.write('event: message\ndata: This is chunk 1\n\n');
  res.write('event: message\ndata: This is chunk 2\n\n');
  setTimeout(() => {
    res.write('event: message\ndata: This is chunk 3\n\n');
    res.end();
  }, 3500);
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
