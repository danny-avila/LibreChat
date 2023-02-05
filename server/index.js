const path = require('path');
const express = require('express');
const app = express();
const port = 3050;
app.use(express.json());

const projectPath = path.join(__dirname, '..');
app.use(express.static(path.join(projectPath, 'public')));

app.get('/', function (req, res) {
  console.log(path.join(projectPath, 'public', 'index.html'));
  res.sendFile(path.join(projectPath, 'public', 'index.html'));
});

app.post('/ask', (req, res) => {
  // Here, you can add the logic to process the user's query
  // and generate a response, which you can then send back
  // in the response body.
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
