/**
 * OpenAI-compatible mock server for credential-free e2e tests. Answers
 * `${baseURL}/chat/completions` with deterministic content. Run standalone
 * (Playwright `webServer`) or import `startMockLlm()` for programmatic control.
 */
const http = require('http');

const DEFAULT_PORT = 8889;
const MOCK_REPLY = process.env.MOCK_LLM_REPLY || 'E2E mock reply: pong';
const MODEL_FALLBACK = 'mock-model';
const STREAM_CHUNK_DELAY_MS = Number(process.env.MOCK_LLM_CHUNK_DELAY_MS) || 60;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function toChunks(text) {
  return text.match(/\S+\s*/g) || [text];
}

async function streamCompletion(res, model) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const id = 'chatcmpl-e2e-mock';
  const created = 1700000000;
  const base = { id, object: 'chat.completion.chunk', created, model };

  const send = (delta, finishReason = null) => {
    const payload = {
      ...base,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({ role: 'assistant', content: '' });
  for (const chunk of toChunks(MOCK_REPLY)) {
    await delay(STREAM_CHUNK_DELAY_MS);
    send({ content: chunk });
  }
  send({}, 'stop');
  res.write('data: [DONE]\n\n');
  res.end();
}

function jsonCompletion(res, model) {
  const payload = {
    id: 'chatcmpl-e2e-mock',
    object: 'chat.completion',
    created: 1700000000,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: MOCK_REPLY },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function handleRequest(req, res) {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url && req.url.endsWith('/chat/completions')) {
    const body = await readJsonBody(req);
    const model = body.model || MODEL_FALLBACK;
    if (body.stream) {
      await streamCompletion(res, model);
    } else {
      jsonCompletion(res, model);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}

function startMockLlm(port = Number(process.env.MOCK_LLM_PORT) || DEFAULT_PORT) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(() => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'mock server error' }));
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`[e2e] Mock LLM server listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startMockLlm();
}

module.exports = { startMockLlm, MOCK_REPLY };
