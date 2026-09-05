import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPreview } from './run.mts';

for (const failUpdate of [false, true]) {
  test(`CRUD runner ${failUpdate ? 'cleans up after failure' : 'completes lifecycle'}`, async () => {
    let saved: { id: string; name: string } | undefined;
    const steps: string[] = [];
    const server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      const send = (status: number, body: object): void => {
        res.writeHead(status);
        res.end(JSON.stringify(body));
      };
      assert(req.headers['x-request-id']);
      if (req.headers.authorization !== 'Bearer fixture-token') {
        send(401, { error: 'Unauthorized' });
        return;
      }
      if (req.url?.endsWith('/foreign-agent')) {
        send(404, { error: { code: 'not_found' } });
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const projection = (): object => ({
        ...saved,
        provider: 'openAI',
        model: 'fixture',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      if (req.method === 'POST') {
        saved = { id: 'agent-preview', name: input.name };
        send(201, projection());
      } else if (req.method === 'PATCH' && input.author) {
        send(400, { error: { code: 'invalid_request' } });
      } else if (req.method === 'PATCH') {
        if (failUpdate) send(500, { error: { code: 'internal_error' } });
        else {
          assert(saved);
          saved.name = input.name;
          send(200, projection());
        }
      } else if (req.method === 'DELETE') {
        if (!saved) send(404, { error: { code: 'not_found' } });
        else {
          saved = undefined;
          send(200, { id: 'agent-preview', deleted: true });
        }
      } else if (req.url?.includes('?')) {
        send(200, {
          object: 'list',
          data: saved ? [projection()] : [],
          has_more: false,
          after: null,
        });
      } else if (saved) send(200, projection());
      else send(404, { error: { code: 'not_found' } });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address === 'object');
    try {
      const result = runPreview({
        collectionUrl: `http://127.0.0.1:${address.port}/agents`,
        token: 'fixture-token',
        provider: 'openAI',
        model: 'fixture',
        revision: 'fixture',
        environment: 'local',
        foreignAgentId: 'foreign-agent',
        report: (event) => {
          steps.push(event.step);
        },
      });
      if (failUpdate) await assert.rejects(result, /Unexpected HTTP 500/);
      else await result;
      assert.equal(saved, undefined);
      assert(steps.includes('foreign-agent'));
      assert(steps.includes('reject-ownership'));
      assert.deepEqual(steps.slice(-3), ['delete', 'verify-deletion', 'repeat-deletion']);
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
}

test('rejects non-local plaintext endpoints before sending credentials', async () => {
  await assert.rejects(
    runPreview({
      collectionUrl: 'http://example.com/agents',
      token: 'secret',
      provider: 'openAI',
      model: 'fixture',
      revision: 'fixture',
      environment: 'test',
    }),
    /Use HTTPS/,
  );
});
