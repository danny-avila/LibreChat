const express = require('express');
const dbConnect = require('../models/dbConnect');
const path = require('path');
const cors = require('cors');
const routes = require('./routes');
const app = express();
const port = process.env.PORT || 3050;
const projectPath = path.join(__dirname, '..', '..', 'client');
dbConnect().then(() => console.log('Connected to MongoDB'));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(projectPath, 'public')));

app.get('/', function (req, res) {
  console.log(path.join(projectPath, 'public', 'index.html'));
  res.sendFile(path.join(projectPath, 'public', 'index.html'));
});

app.use('/ask', routes.ask);
app.use('/messages', routes.messages);
app.use('/convos', routes.convos);
app.use('/customGpts', routes.customGpts);
app.use('/prompts', routes.prompts);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});