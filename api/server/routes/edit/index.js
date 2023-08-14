const express = require('express');
const router = express.Router();
const openAI = require('./openAI');
const gptPlugins = require('./gptPlugins');
const anthropic = require('./anthropic');
// const google = require('./google');

router.use(['/azureOpenAI', '/openAI'], openAI);
router.use('/gptPlugins', gptPlugins);
router.use('/anthropic', anthropic);
// router.use('/google', google);

module.exports = router;
