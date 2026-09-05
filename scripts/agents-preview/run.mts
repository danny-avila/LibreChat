import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

type JsonObject = { [key: string]: unknown };

export interface PreviewOptions {
  collectionUrl: string;
  token: string;
  provider: string;
  model: string;
  revision: string;
  environment: string;
  foreignAgentId?: string;
  report?: (event: PreviewEvent) => void;
}

interface PreviewEvent {
  step: string;
  requestId: string;
  status: number;
}

function object(value: unknown): JsonObject {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as JsonObject;
}

function agent(value: unknown, id?: string): JsonObject {
  const result = object(value);
  assert(typeof result.id === 'string' && result.id.length > 0, 'Missing Agent ID');
  if (id) assert.equal(result.id, id);
  assert(typeof result.provider === 'string');
  assert(typeof result.model === 'string' || result.model === null);
  assert(Number.isInteger(result.version));
  for (const field of ['createdAt', 'updatedAt']) {
    assert(typeof result[field] === 'string' && Number.isFinite(Date.parse(result[field])));
  }
  for (const field of ['tenantId', 'author', 'versions', '_id', 'credentials']) {
    assert(!(field in result), `Internal field exposed: ${field}`);
  }
  return result;
}

/** Exercise only a newly created Agent; a supplied foreign ID is read-only. */
export async function runPreview(options: PreviewOptions): Promise<void> {
  const collection = new URL(options.collectionUrl);
  assert(!collection.username && !collection.password && !collection.search && !collection.hash);
  assert(
    collection.protocol === 'https:' ||
      (collection.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(collection.hostname)),
    'Use HTTPS outside localhost',
  );
  collection.pathname = collection.pathname.replace(/\/$/, '');
  const report = options.report ?? ((event: PreviewEvent) => console.log(JSON.stringify(event)));
  const runId = randomUUID();
  let createdId: string | undefined;

  async function request({
    step,
    method = 'GET',
    id,
    body,
    token = options.token,
    query,
  }: {
    step: string;
    method?: string;
    id?: string;
    body?: JsonObject;
    token?: string;
    query?: URLSearchParams;
  }): Promise<{ status: number; body: unknown }> {
    const url = new URL(collection);
    if (id) {
      assert(id !== '.' && id !== '..', 'Invalid Agent ID');
      url.pathname += `/${encodeURIComponent(id)}`;
    }
    if (query) url.search = query.toString();
    const requestId = `${runId}-${step}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'x-request-id': requestId,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error(`${step}: request failed (${requestId})`);
    }
    report({ step, requestId, status: response.status });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`${step}: expected JSON (${requestId})`);
    }
    return { status: response.status, body: payload };
  }

  function status(actual: number, expected: number | number[]): void {
    assert(
      (Array.isArray(expected) ? expected : [expected]).includes(actual),
      `Unexpected HTTP ${actual}`,
    );
  }

  for (const [step, token] of [
    ['missing-token', ''],
    ['invalid-token', 'invalid-preview-token'],
  ]) {
    const response = await request({ step: step!, token: token! });
    status(response.status, [401, 403]);
  }
  if (options.foreignAgentId) {
    const response = await request({ step: 'foreign-agent', id: options.foreignAgentId });
    status(response.status, 404);
  }

  try {
    const name = `CRUD preview ${runId}`;
    const created = await request({
      step: 'create',
      method: 'POST',
      body: {
        name,
        provider: options.provider,
        model: options.model,
        instructions: 'Preview fixture. Do not execute.',
      },
    });
    // Capture the ID before validating the projection so failed assertions still clean up.
    const createdBody = object(created.body);
    if (typeof createdBody.id === 'string' && createdBody.id) createdId = createdBody.id;
    status(created.status, 201);
    agent(createdBody);
    assert(createdId);
    assert.equal(createdBody.name, name);

    const read = await request({ step: 'retrieve', id: createdId });
    status(read.status, 200);
    assert.equal(agent(read.body, createdId).name, name);

    let cursor: string | undefined;
    let found = false;
    const cursors = new Set<string>();
    for (let page = 0; page < 100 && !found; page++) {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) query.set('cursor', cursor);
      const listed = await request({ step: `list-${page}`, query });
      status(listed.status, 200);
      const list = object(listed.body);
      assert.equal(list.object, 'list');
      assert(Array.isArray(list.data));
      found = list.data.some((entry: unknown) => agent(entry).id === createdId);
      if (found || list.has_more === false) break;
      assert.equal(list.has_more, true);
      assert(typeof list.after === 'string' && list.after.length > 0 && !cursors.has(list.after));
      cursor = list.after;
      cursors.add(cursor);
    }
    assert(found, 'Created Agent missing from first 100 list pages');

    const malformed = await request({
      step: 'reject-ownership',
      method: 'PATCH',
      id: createdId,
      body: { author: 'forged-preview-owner', tenantId: 'forged-preview-tenant' },
    });
    status(malformed.status, 400);
    assert.equal(object(object(malformed.body).error).code, 'invalid_request');

    const updatedName = `${name} updated`;
    const updated = await request({
      step: 'update',
      method: 'PATCH',
      id: createdId,
      body: { name: updatedName },
    });
    status(updated.status, 200);
    assert.equal(agent(updated.body, createdId).name, updatedName);
    const persisted = await request({ step: 'verify-update', id: createdId });
    status(persisted.status, 200);
    assert.equal(agent(persisted.body, createdId).name, updatedName);
  } finally {
    if (createdId) {
      const deleted = await request({ step: 'delete', method: 'DELETE', id: createdId });
      status(deleted.status, 200);
      assert.deepEqual(deleted.body, { id: createdId, deleted: true });
      const missing = await request({ step: 'verify-deletion', id: createdId });
      status(missing.status, 404);
      const repeated = await request({ step: 'repeat-deletion', method: 'DELETE', id: createdId });
      status(repeated.status, 404);
    }
  }
}

function required(name: string): string {
  const value = process.env[name];
  assert(value, `Set ${name}`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options: PreviewOptions = {
      collectionUrl: required('AGENT_PREVIEW_URL'),
      token: required('AGENT_PREVIEW_TOKEN'),
      provider: required('AGENT_PREVIEW_PROVIDER'),
      model: required('AGENT_PREVIEW_MODEL'),
      revision: required('AGENT_PREVIEW_REVISION'),
      environment: required('AGENT_PREVIEW_ENVIRONMENT'),
      foreignAgentId: process.env.AGENT_PREVIEW_FOREIGN_ID,
    };
    console.log(
      JSON.stringify({
        revision: options.revision,
        environment: options.environment,
        startedAt: new Date().toISOString(),
      }),
    );
    await runPreview(options);
    console.log('CRUD smoke checks passed.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Preview failed');
    process.exitCode = 1;
  }
}
