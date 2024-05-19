const WebSocket = require('ws');

const ELEVENLABS_API_KEY = 'a495399653cc5824ba1e41d914473e07';
const VOICE_ID = '1RVpBInY9YUYMLSUQReV';

/**
 * @typedef {Object} VoiceSettings
 * @property {number} similarity_boost
 * @property {number} stability
 * @property {boolean} use_speaker_boost
 */

/**
 * @typedef {Object} GenerateAudioBulk
 * @property {string} model_id
 * @property {string} text
 * @property {VoiceSettings} voice_settings
 */

/**
 * @typedef {Object} TextToSpeechClient
 * @property {function(Object): Promise<stream.Readable>} generate
 */

/**
 * @typedef {Object} AudioChunk
 * @property {string} audio
 * @property {boolean} isFinal
 * @property {Object} alignment
 * @property {number[]} alignment.char_start_times_ms
 * @property {number[]} alignment.chars_durations_ms
 * @property {string[]} alignment.chars
 * @property {Object} normalizedAlignment
 * @property {number[]} normalizedAlignment.char_start_times_ms
 * @property {number[]} normalizedAlignment.chars_durations_ms
 * @property {string[]} normalizedAlignment.chars
 */

/**
 * Input stream text to speech
 * @param {Express.Response} res
 * @param {AsyncIterable<string>} textStream
 * @param {(token: string) => Promise<boolean>} callback - Whether to continue the stream or not
 * @returns {AsyncGenerator<AudioChunk>}
 */
function inputStreamTextToSpeech(res, textStream, callback) {
  const model = 'eleven_turbo_v2';
  const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input?model_id=${model}`;
  const socket = new WebSocket(wsUrl);

  socket.onopen = function () {
    const streamStart = {
      text: ' ',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
      },
      xi_api_key: ELEVENLABS_API_KEY,
    };

    socket.send(JSON.stringify(streamStart));

    // send stream until done
    const streamComplete = new Promise((resolve, reject) => {
      (async () => {
        for await (const message of textStream) {
          const request = {
            text: message,
            try_trigger_generation: true,
          };
          const shouldContinue = await callback(message);
          socket.send(JSON.stringify(request));
          if (!shouldContinue) {
            break;
          }
        }
      })()
        .then(resolve)
        .catch(reject);
    });

    streamComplete
      .then(() => {
        const endStream = {
          text: '',
        };

        socket.send(JSON.stringify(endStream));
      })
      .catch((e) => {
        console.error('Error streaming text to speech:', e);
        throw e;
      });
  };

  return (async function* audioStream() {
    let isDone = false;
    let chunks = [];
    let resolve;
    let waitForMessage = new Promise((r) => (resolve = r));

    socket.onmessage = function (event) {
      // console.log(event);
      const audioChunk = JSON.parse(event.data);
      if (audioChunk.audio && audioChunk.alignment) {
        res.write(`event: audio\ndata: ${event.data}\n\n`);
        chunks.push(audioChunk);
        resolve(null);
        waitForMessage = new Promise((r) => (resolve = r));
      } else if (audioChunk.isFinal) {
        isDone = true;
        resolve(null);
      } else if (audioChunk.message) {
        console.warn('Received Elevenlabs message:', audioChunk.message);
        resolve(null);
      }
    };

    socket.onerror = function (error) {
      console.error('WebSocket error:', error);
      throw error;
    };

    socket.onclose = function () {
      isDone = true;
      resolve(null);
    };

    while (!isDone) {
      await waitForMessage;
      yield* chunks;
      chunks = [];
    }

    res.write('event: end\ndata: \n\n');
  })();
}

/**
 *
 * @param {AsyncIterable<string>} llmStream
 */
async function* llmMessageSource(llmStream) {
  for await (const chunk of llmStream) {
    const message = chunk.choices[0].delta.content;
    if (message) {
      yield message;
    }
  }
}

module.exports = {
  inputStreamTextToSpeech,
  llmMessageSource,
};
