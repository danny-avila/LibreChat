const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const axios = require('axios');
const express = require('express');
const request = require('supertest');
const { createMediaRuntimeFromApp, validateEndpointURL } = require('@librechat/api');
const { mergeConfigOverrides } = require('@librechat/data-schemas');
const { resolveMediaConfig } = require('librechat-data-provider');

// Diagnostic assertions describe the audited defect. No inference, credentials, or stored data.
async function main() {
  let providerRequests = 0;
  const provider = http.createServer((req, res) => {
    providerRequests++;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/images/models') {
      res.end(JSON.stringify({ data: [{ id: 'audit/image' }] }));
    } else if (req.url === '/v1/images/models/audit/image/endpoints') {
      res.end(JSON.stringify({ id: 'audit/image', endpoints: [{
        provider_tag: 'audit-provider',
        supported_parameters: { n: { type: 'range', min: 1, max: 1 } },
      }] }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const port = provider.address().port;
  const root = `http://127.0.0.1:${port}/v1`;
  const address = `127.0.0.1:${port}`;
  const results = [];
  try {
    for (const [baseAllows, effectiveAllows] of [[true, false], [false, true]]) {
      providerRequests = 0;
      const base = {
        fileStrategy: 'local', transactions: { enabled: false }, balance: { enabled: false },
        paths: { imageOutput: path.join(os.tmpdir(), 'media-audit-unused-images'),
          uploads: path.join(os.tmpdir(), 'media-audit-unused-uploads') },
        media: resolveMediaConfig({ enabled: true, integrations: [{
          id: 'audit', api: 'openrouter.images', endpointRef: { kind: 'custom', name: 'Audit' },
          catalog: { kind: 'configured', models: ['audit/image'] }, operations: ['image.generate'],
        }] }),
        endpoints: { allowedAddresses: baseAllows ? [address] : [], custom: [{
          name: 'Audit', apiKey: 'synthetic-audit-key', baseURL: root,
        }] },
      };
      const effective = mergeConfigOverrides(base, [{
        principalType: 'user', principalId: 'audit-owner', priority: 10,
        overrides: { endpoints: { allowedAddresses: effectiveAllows ? [address] : [] } },
      }]);
      assert.deepEqual(effective.endpoints.allowedAddresses, effectiveAllows ? [address] : []);
      let sharedValidatorAllows;
      try {
        await validateEndpointURL(root, 'Audit', effective.endpoints.allowedAddresses);
        sharedValidatorAllows = true;
      } catch { sharedValidatorAllows = false; }
      assert.equal(sharedValidatorAllows, effectiveAllows);
      const logged = [];
      const runtime = createMediaRuntimeFromApp({
        appConfig: base, db: {},
        getRoleByName: async () => ({ permissions: { MEDIA: { USE: true, CREATE: true } } }),
        getAppConfig: async () => effective,
        tenantContext: { run: (_scope, work) => work() }, asSystem: (work) => work(),
        environment: {}, http: axios.create({ proxy: false }),
        upload: () => { throw new Error('Unexpected upload'); },
        readFile: async () => { throw new Error('Unexpected file read'); },
        decrypt: async (value) => value, log: (error) => logged.push(error),
      });
      const app = express();
      app.use((req, _res, next) => { req.user = { id: 'audit-owner', role: 'USER' }; next(); });
      app.use('/api/media', runtime.router);
      const response = await request(app).get('/api/media/catalog').expect(200);
      const available = response.body.offerings[0]?.available;
      assert.equal(available, baseAllows);
      assert.equal(providerRequests, baseAllows ? 2 : 0);
      assert.equal(logged.length, 0);
      results.push({ baseAllows, effectiveAllows, sharedValidatorAllows,
        mediaCatalogAvailable: available, providerRequests });
    }
    console.log(JSON.stringify({ scenario: 'effective endpoint SSRF exemptions versus media host transport', results }, null, 2));
  } finally {
    provider.closeAllConnections();
    await new Promise((resolve, reject) => provider.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
