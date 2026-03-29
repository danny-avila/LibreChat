const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3333);
const PISTON_URL = process.env.PISTON_URL || 'http://piston:2000';

const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Local Piston Code Execution API',
    version: '1.0.0',
    description:
      'Local code execution bridge for LibreChat Actions. Executes code through self-hosted Piston.',
  },
  servers: [{ url: `http://piston_action:${PORT}` }],
  paths: {
    '/execute': {
      post: {
        operationId: 'executeCode',
        summary: 'Execute code in a local sandbox runtime',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  language: {
                    type: 'string',
                    description: 'Runtime language, for example: python, javascript, typescript, bash, go, rust',
                  },
                  code: {
                    type: 'string',
                    description: 'Source code to execute',
                  },
                  stdin: {
                    type: 'string',
                    description: 'Optional stdin input',
                    default: '',
                  },
                  args: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional runtime arguments',
                    default: [],
                  },
                },
                required: ['language', 'code'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Execution result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    language: { type: 'string' },
                    version: { type: 'string' },
                    run: {
                      type: 'object',
                      properties: {
                        stdout: { type: 'string' },
                        stderr: { type: 'string' },
                        code: { type: 'integer' },
                        signal: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/runtimes': {
      get: {
        operationId: 'listRuntimes',
        summary: 'List available local runtimes',
        responses: {
          200: {
            description: 'Available runtimes',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      language: { type: 'string' },
                      version: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

const readJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(raw);
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = (data && data.message) || `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
};

/** Maps LibreChat 2-letter lang codes → Piston runtime names */
const LANG_MAP = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  php: 'php',
  rs: 'rust',
  go: 'go',
  d: 'd',
  f90: 'fortran',
  r: 'r',
  bash: 'bash',
};

const runPiston = async (language, code, stdin = '', args = []) => {
  const payload = {
    language,
    version: '*',
    files: [{ name: 'main', content: code }],
    stdin,
    args,
    run_timeout: 3000,
    compile_timeout: 3000,
    run_memory_limit: 256000000,
    compile_memory_limit: 256000000,
  };
  return fetchJson(`${PISTON_URL}/api/v2/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

/** Original /execute endpoint — uses `language` field (OpenAPI action format) */
const handleExecute = async (req, res) => {
  const { language, code, stdin = '', args = [] } = await readJson(req);

  if (!language || !code) {
    sendJson(res, 400, { message: 'language and code are required' });
    return;
  }

  const result = await runPiston(language, code, stdin, args);
  sendJson(res, 200, result);
};

/** /exec endpoint — LibreChat CodeExecutor format: uses `lang` (2-letter) field */
const handleExec = async (req, res) => {
  const { lang, code, args = [] } = await readJson(req);

  if (!lang || !code) {
    sendJson(res, 400, { message: 'lang and code are required' });
    return;
  }

  const language = LANG_MAP[lang] || lang;
  const result = await runPiston(language, code, '', args);

  const run = result.run || result;
  sendJson(res, 200, {
    stdout: run.stdout || '',
    stderr: run.stderr || run.message || '',
    session_id: `piston-${Date.now()}`,
  });
};

const handleRuntimes = async (res) => {
  const result = await fetchJson(`${PISTON_URL}/api/v2/runtimes`, {
    method: 'GET',
  });
  sendJson(res, 200, result);
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'GET' && requestUrl.pathname === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/openapi.json') {
      sendJson(res, 200, openApiSpec);
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/runtimes') {
      await handleRuntimes(res);
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/execute') {
      await handleExecute(req, res);
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/exec') {
      await handleExec(req, res);
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname.startsWith('/files/')) {
      sendJson(res, 200, []);
      return;
    }

    sendJson(res, 404, { message: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { message: error instanceof Error ? error.message : 'Unexpected error' });
  }
});

server.listen(PORT, () => {
  console.log(`piston-action-server listening on ${PORT}`);
});
