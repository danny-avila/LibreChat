const express = require('express');
const router = express.Router();
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const glob = require('glob');

router.get('/', requireJwtAuth, async (req, res) => {
  // Glob all .json files from the folder /prompts/
  const globPattern = '../../../prompts/**/*.json';
  const files = glob.sync(globPattern, { cwd: __dirname, realpath: true });
  const presets = [];
  let id = 0;
  files.forEach((file) => {
    const preset = require(file);
    const tags = file.split('/');
    tags.splice(0, 4)
    const filename = tags.pop();
    // You can group prompts by adding the tagname then a dash. ie "coding-LaravelGPT.json"
    if (filename.includes('-')) {
      tags.push(filename.split('-')[0]);
    }
    presets.push({
      presetId: null,
      id: id,
      ...preset,
      tags: tags,
      open: false,
    });
    id++;
  });

  res.status(200).send(presets);
});

module.exports = router;
