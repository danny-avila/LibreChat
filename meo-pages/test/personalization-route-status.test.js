import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, sessionCookieHeader } from '../functions/_lib/session.js';
import { onRequest } from '../functions/api/meo/[[path]].js';

const environment = {
  SESSION_SECRET: Buffer.alloc(32, 47).toString('base64url'),
  MEO_OAUTH_CLIENT_ID: '8f2e0255-187d-448f-9e25-bc275d1b6015',
  MEO_API_URL: 'https://api.meoarch.org',
};
const uuid='3e36a09a-d4c3-4428-8c0c-aed019179a04';
async function request(path) {
  const sealed=await seal({accessToken:'access',refreshToken:'refresh',
    expiresAt:Math.floor(Date.now()/1000)+900,userId:uuid},environment);
  return new Request('https://chat.meoarch.org/api/meo'+path,{
    headers:{Cookie:sessionCookieHeader(sealed).split(';')[0]}
  });
}
async function withFetch(handler, callback) {
  const original=globalThis.fetch;
  globalThis.fetch=handler;
  try {return await callback()} finally {globalThis.fetch=original}
}

for (const path of ['/settings', '/memories', '/memories?archived=true']) {
  test('missing backend collection is identified as unavailable, not deleted: '+path, async () => {
    await withFetch(async () => Response.json({error:{code:'not_found'}},{status:404}),async()=>{
      const response=await onRequest({request:await request(path),env:environment});
      assert.equal(response.status,503);
      assert.equal(response.headers.get('Retry-After'),'60');
      assert.equal((await response.json()).error.code,'personalization_unavailable');
    });
  });
}

test('real record-not-found 404 is preserved', async()=>{
  await withFetch(async()=>Response.json({error:{code:'memory_not_found'}},{status:404}),async()=>{
    const response=await onRequest({request:await request('/memories'),env:environment});
    assert.equal(response.status,404);
    assert.equal((await response.json()).error.code,'memory_not_found');
  });
});

test('authorization failures are never transformed', async()=>{
  await withFetch(async()=>Response.json({error:{code:'unauthenticated'}},{status:401}),async()=>{
    const response=await onRequest({request:await request('/settings'),env:environment});
    assert.equal(response.status,401);
    assert.equal((await response.json()).error.code,'unauthenticated');
  });
});

test('successful server settings are passed through unchanged',async()=>{
  const saved={settings:{version:3,personalInstructions:'test',memoryEnabled:true,uiPreferences:{}}};
  await withFetch(async()=>Response.json(saved),async()=>{
    const response=await onRequest({request:await request('/settings'),env:environment});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),saved);
  });
});

test('other HTTP 404 errors on the collection are not transformed', async()=>{
  await withFetch(async()=>Response.json({error:{code:'account_record_missing'}},{status:404}),async()=>{
    const response=await onRequest({request:await request('/settings'),env:environment});
    assert.equal(response.status,404);
    assert.equal((await response.json()).error.code,'account_record_missing');
  });
});
