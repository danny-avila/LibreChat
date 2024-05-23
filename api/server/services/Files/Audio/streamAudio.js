const WebSocket = require('ws');
const { Message } = require('~/models/Message');

/**
 * @param {string[]} voiceIds - Array of voice IDs
 * @returns {string}
 */
function getRandomVoiceId(voiceIds) {
  const randomIndex = Math.floor(Math.random() * voiceIds.length);
  return voiceIds[randomIndex];
}

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
 *
 * @param {Record<string, unknown | undefined>} parameters
 * @returns
 */
function assembleQuery(parameters) {
  let query = '';
  let hasQuestionMark = false;

  for (const [key, value] of Object.entries(parameters)) {
    if (value == null) {
      continue;
    }

    if (!hasQuestionMark) {
      query += '?';
      hasQuestionMark = true;
    } else {
      query += '&';
    }

    query += `${key}=${value}`;
  }

  return query;
}

const SEPARATORS = ['.', '?', '!', '۔', '。', '‥', ';', '¡', '¿', '\n'];

/**
 *
 * @param {string} text
 * @param {string[] | undefined} [separators]
 * @returns
 */
function findLastSeparatorIndex(text, separators = SEPARATORS) {
  let lastIndex = -1;
  for (const separator of separators) {
    const index = text.lastIndexOf(separator);
    if (index > lastIndex) {
      lastIndex = index;
    }
  }
  return lastIndex;
}

const MAX_NOT_FOUND_COUNT = 6;
const MAX_NO_CHANGE_COUNT = 10;

/**
 * @param {string} messageId
 * @returns {() => Promise<{ text: string, isFinished: boolean }[]>}
 */
function createChunkProcessor(messageId) {
  let notFoundCount = 0;
  let noChangeCount = 0;
  let processedText = '';
  if (!messageId) {
    throw new Error('Message ID is required');
  }

  /**
   * @returns {Promise<{ text: string, isFinished: boolean }[] | string>}
   */
  async function processChunks() {
    if (notFoundCount >= MAX_NOT_FOUND_COUNT) {
      return `Message not found after ${MAX_NOT_FOUND_COUNT} attempts`;
    }

    if (noChangeCount >= MAX_NO_CHANGE_COUNT) {
      return `No change in message after ${MAX_NO_CHANGE_COUNT} attempts`;
    }

    const message = await Message.findOne({ messageId }, 'text unfinished').lean();

    if (!message || !message.text) {
      notFoundCount++;
      return [];
    }

    const { text, unfinished } = message;
    if (text === processedText) {
      noChangeCount++;
    }

    const remainingText = text.slice(processedText.length);
    const chunks = [];

    if (unfinished && remainingText.length >= 20) {
      const separatorIndex = findLastSeparatorIndex(remainingText);
      if (separatorIndex !== -1) {
        const chunkText = remainingText.slice(0, separatorIndex + 1);
        chunks.push({ text: chunkText, isFinished: false });
        processedText += chunkText;
      } else {
        chunks.push({ text: remainingText, isFinished: false });
        processedText = text;
      }
    } else if (!unfinished && remainingText.trim().length > 0) {
      chunks.push({ text: remainingText.trim(), isFinished: true });
      processedText = text;
    }

    return chunks;
  }

  return processChunks;
}

/**
 * @param {string} text
 * @param {number} [chunkSize=4000]
 * @returns {{ text: string, isFinished: boolean }[]}
 */
function splitTextIntoChunks(text, chunkSize = 4000) {
  if (!text) {
    throw new Error('Text is required');
  }

  const chunks = [];
  let startIndex = 0;
  const textLength = text.length;

  while (startIndex < textLength) {
    let endIndex = Math.min(startIndex + chunkSize, textLength);
    let chunkText = text.slice(startIndex, endIndex);

    if (endIndex < textLength) {
      let lastSeparatorIndex = -1;
      for (const separator of SEPARATORS) {
        const index = chunkText.lastIndexOf(separator);
        if (index !== -1) {
          lastSeparatorIndex = Math.max(lastSeparatorIndex, index);
        }
      }

      if (lastSeparatorIndex !== -1) {
        endIndex = startIndex + lastSeparatorIndex + 1;
        chunkText = text.slice(startIndex, endIndex);
      } else {
        const nextSeparatorIndex = text.slice(endIndex).search(/\S/);
        if (nextSeparatorIndex !== -1) {
          endIndex += nextSeparatorIndex;
          chunkText = text.slice(startIndex, endIndex);
        }
      }
    }

    chunkText = chunkText.trim();
    if (chunkText) {
      chunks.push({
        text: chunkText,
        isFinished: endIndex >= textLength,
      });
    } else if (chunks.length > 0) {
      chunks[chunks.length - 1].isFinished = true;
    }

    startIndex = endIndex;
    while (startIndex < textLength && text[startIndex].trim() === '') {
      startIndex++;
    }
  }

  return chunks;
}

/**
 * Input stream text to speech
 * @param {Express.Response} res
 * @param {AsyncIterable<string>} textStream
 * @param {(token: string) => Promise<boolean>} callback - Whether to continue the stream or not
 * @returns {AsyncGenerator<AudioChunk>}
 */
function inputStreamTextToSpeech(res, textStream, callback) {
  const model = 'eleven_monolingual_v1';
  const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${getRandomVoiceId()}/stream-input${assembleQuery(
    {
      model_id: model,
      // flush: true,
      // optimize_streaming_latency: this.settings.optimizeStreamingLatency,
      optimize_streaming_latency: 1,
      // output_format: this.settings.outputFormat,
    },
  )}`;
  const socket = new WebSocket(wsUrl);

  socket.onopen = function () {
    const streamStart = {
      text: ' ',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
      },
      xi_api_key: process.env.ELEVENLABS_API_KEY,
      // generation_config: { chunk_length_schedule: [50, 90, 120, 150, 200] },
    };

    socket.send(JSON.stringify(streamStart));

    // send stream until done
    const streamComplete = new Promise((resolve, reject) => {
      (async () => {
        let textBuffer = '';
        let shouldContinue = true;
        for await (const textDelta of textStream) {
          textBuffer += textDelta;

          // using ". " as separator: sending in full sentences improves the quality
          // of the audio output significantly.
          const separatorIndex = findLastSeparatorIndex(textBuffer);

          // Callback for textStream (will return false if signal is aborted)
          shouldContinue = await callback(textDelta);

          if (separatorIndex === -1) {
            continue;
          }

          if (!shouldContinue) {
            break;
          }

          const textToProcess = textBuffer.slice(0, separatorIndex);
          textBuffer = textBuffer.slice(separatorIndex + 1);

          const request = {
            text: textToProcess,
            try_trigger_generation: true,
          };

          socket.send(JSON.stringify(request));
        }

        // send remaining text:
        if (shouldContinue && textBuffer.length > 0) {
          socket.send(
            JSON.stringify({
              text: `${textBuffer} `, // append space
              try_trigger_generation: true,
            }),
          );
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
      // throw error;
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
  findLastSeparatorIndex,
  createChunkProcessor,
  splitTextIntoChunks,
  llmMessageSource,
  getRandomVoiceId,
};
