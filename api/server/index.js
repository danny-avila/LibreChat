const express = require('express');
const dbConnect = require('../models/dbConnect');
const path = require('path');
const cors = require('cors');
const routes = require('./routes');
const app = express();
const port = process.env.PORT || 3080;
const projectPath = path.join(__dirname, '..', '..', 'client');
dbConnect().then(() => console.log('Connected to MongoDB'));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(projectPath, 'public')));

app.get('/', function (req, res) {
  console.log(path.join(projectPath, 'public', 'index.html'));
  res.sendFile(path.join(projectPath, 'public', 'index.html'));
});

app.use('/api/ask', routes.ask);
app.use('/api/messages', routes.messages);
app.use('/api/convos', routes.convos);
app.use('/api/customGpts', routes.customGpts);
app.use('/api/prompts', routes.prompts);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});