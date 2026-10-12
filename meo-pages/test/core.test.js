import test from 'node:test';
import assert from 'node:assert/strict';
import { chatContext, requestedSelection, safeMarkdown, SseParser } from '../public/core.js';

test('long conversations retain recent context within broker limits', () => {
  const history = Array.from({ length: 100 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `turn-${index}`,
  }));
  const selected = chatContext(history);
  assert.equal(selected.length, 80);
  assert.equal(selected[0].content, 'turn-20');
  assert.equal(selected.at(-1).content, 'turn-99');
  assert.deepEqual(
    chatContext([
      { role: 'assistant', content: 'old'.repeat(12000) },
      { role: 'user', content: 'new' },
    ]),
    [{ role: 'user', content: 'new' }],
  );
});

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

test('markdown renders common headings, lists, inline styles, and fenced code', () => {
  const html = safeMarkdown(
    '# Title\n\n- one\n- **two**\n\n1. first\n2. second\n\nUse `code` and *emphasis*.\n\n```js\nconst value = "<safe>";\n```',
  );
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<ul><li>one<\/li><li><strong>two<\/strong><\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<em>emphasis<\/em>/);
  assert.match(html, /<code class="language-js">const value = &quot;&lt;safe&gt;&quot;;<\/code>/);
});

test('markdown keeps unfinished code fences escaped instead of interpreting HTML', () => {
  const html = safeMarkdown('```html\n<script>alert(1)</script>');
  assert.match(html, /<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code><\/pre>/);
  assert.doesNotMatch(html, /<script>/);
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
