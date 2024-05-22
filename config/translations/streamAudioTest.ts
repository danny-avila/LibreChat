import { WebSocket } from 'ws';
// const { ElevenLabsClient } = require('elevenlabs');

const ELEVENLABS_API_KEY = 'a495399653cc5824ba1e41d914473e07';
const VOICE_ID = '1RVpBInY9YUYMLSUQReV';

interface AudioChunk {
  audio: string;
  isFinal: boolean;
  alignment: {
    char_start_times_ms: number[];
    chars_durations_ms: number[];
    chars: string[];
  };
  normalizedAlignment: {
    char_start_times_ms: number[];
    chars_durations_ms: number[];
    chars: string[];
  };
}

export function inputStreamTextToSpeech(
  textStream: AsyncIterable<string>,
): AsyncGenerator<AudioChunk> {
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
          socket.send(JSON.stringify(request));
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
        throw e;
      });
  };

  return (async function* audioStream() {
    let isDone = false;
    let chunks: AudioChunk[] = [];
    let resolve: (value: unknown) => void;
    let waitForMessage = new Promise((r) => (resolve = r));

    socket.onmessage = function (event) {
      console.log(event);
      const audioChunk = JSON.parse(event.data as string) as AudioChunk;
      if (audioChunk.audio && audioChunk.alignment) {
        chunks.push(audioChunk);
        resolve(null);
        waitForMessage = new Promise((r) => (resolve = r));
      }
    };

    socket.onerror = function (error) {
      throw error;
    };

    // Handle socket closing
    socket.onclose = function () {
      isDone = true;
    };

    while (!isDone) {
      await waitForMessage;
      yield* chunks;
      chunks = [];
    }
  })();
}

import OpenAI from 'openai';
import { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';

export async function streamCompletion({ systemPrompt, messages }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client.beta.chat.completions.stream({
    model: 'gpt-4-0125-preview',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  });
}

export async function* llmMessageSource(llmStream: ChatCompletionStream): AsyncIterable<string> {
  for await (const chunk of llmStream) {
    const message = chunk.choices[0].delta.content;
    if (message) {
      yield message;
    }
  }
}

async function main(systemPrompt: string, prompt: string) {
  const llmStream = await streamCompletion({
    systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });
  const llmMessageStream = llmMessageSource(llmStream);
  console.log('Streaming LLM messages...');
  for await (const audio of inputStreamTextToSpeech(llmMessageStream)) {
    console.log(audio);
  }
}

main('Hello, how can I help you today?', 'What is the meaning of life?');
