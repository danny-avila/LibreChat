/**
 * Speech-to-Text API route handler.
 * 
 * This module defines the REST API endpoint for speech-to-text transcription.
 * It accepts audio files via POST request and returns transcribed text.
 * 
 * Endpoint: POST /api/speech/stt
 * Content-Type: multipart/form-data
 * Body: audio file in supported format (webm, mp3, wav, etc.)
 * 
 * Response: { text: "transcribed text" }
 */
const express = require('express');
const { speechToText } = require('~/server/services/Files/Audio');

const router = express.Router();

// POST /api/speech/stt - Process audio file and return transcribed text
router.post('/', speechToText);

module.exports = router;
