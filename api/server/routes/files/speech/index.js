const express = require('express');
const { createTTSLimiters, createSTTLimiters } = require('~/server/middleware');

const stt = require('./stt');
const tts = require('./tts');
const customConfigSpeech = require('./customConfigSpeech');
const realtime = require('./realtime');

const router = express.Router();

const { sttIpLimiter, sttUserLimiter } = createSTTLimiters();
const { ttsIpLimiter, ttsUserLimiter } = createTTSLimiters();
router.use('/stt', sttIpLimiter, sttUserLimiter, stt);
router.use('/tts', ttsIpLimiter, ttsUserLimiter, tts);

router.use('/config', customConfigSpeech);

router.use('/realtime', realtime);

module.exports = router;
