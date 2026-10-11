import test from 'node:test';
import assert from 'node:assert/strict';
import { requestedSelection, safeMarkdown, SseParser } from '../public/core.js';

test('deep links select only a connection and model available to that account', () => {
  const connections = [{ id: 'credential-1', defaultModel: 'model-a' }];
  assert.deepEqual(
    requestedSelection('?connection=credential-1&model=model-b', connections, {
      supported: true,
      models: [{ id: 'model-a' }, { id: 'model-b' }],
    }),
    { connection: connections[0], model: 'model-b', warning: '' },
  );
  assert.equal(
    requestedSelection('?connection=other&model=model-b', connections, {
      supported: true,
      models: [{ id: 'model-a' }],
    }).warning,
    'invalid_connection',
  );
  assert.equal(
    requestedSelection('?connection=credential-1&model=unknown', connections, {
      supported: true,
      models: [{ id: 'model-a' }],
    }).model,
    'model-a',
  );
});

test('markdown output escapes HTML and allows only safe link protocols', () => {
  const html = safeMarkdown(
    '<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) [good](https://example.com)',
  );
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img\b/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /href="https:\/\/example.com/);
});

test('SSE parser handles split UTF-8 and provider delta frames', () => {
  const events = [];
  const parser = new SseParser((event, data) => events.push({ event, data }));
  const bytes = new TextEncoder().encode(
    'data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: [DONE]\r\n\r\n',
  );
  parser.push(bytes.slice(0, 54));
  parser.push(bytes.slice(54), true);
  assert.deepEqual(events, [
    { event: 'message', data: { choices: [{ delta: { content: '你好' } }] } },
    { event: 'message', data: '[DONE]' },
  ]);
});
