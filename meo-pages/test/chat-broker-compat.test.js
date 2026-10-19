import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyBrokerChatPayload } from '../functions/_lib/legacy-chat.js';
import { seal, sessionCookieHeader } from '../functions/_lib/session.js';
import { onRequest } from '../functions/api/meo/[[path]].js';

const id='3e36a09a-d4c3-4428-8c0c-aed019179a04';
const environment = {
  SESSION_SECRET: Buffer.alloc(32,13).toString('base64url'),
  MEO_OAUTH_CLIENT_ID: '8f2e0255-187d-448f-9e25-bc275d1b6015',
  MEO_API_URL: 'https://api.meoarch.org',
};
const prompt = { credentialId:id,model:'gpt-4o',conversationId:null,prompt:'Hello',context:[] };
const consent = { requestId:id,payloadSha256:'a'.repeat(64),confirmationVersion:1 };
async function request(path, body) {
  const cookie=await seal({accessToken:'test-access',refreshToken:'test-refresh',
    expiresAt:Math.floor(Date.now()/1000)+900,userId:id},environment);
  return new Request('https://chat.meoarch.org/api/meo'+path,{
    method:'POST',headers:{Origin:'https://chat.meoarch.org',
      Cookie:sessionCookieHeader(cookie).split(';')[0],
      'Content-Type':'application/json'},
    body:JSON.stringify(body),
  });
}
const missing=()=>Response.json({error:{code:'not_found'}},{status:404});
const sentBody = options => JSON.parse(options.body instanceof ArrayBuffer
  ? new TextDecoder().decode(options.body) : options.body);
async function mockNetwork(handler,callback) {
  const original=globalThis.fetch;
  globalThis.fetch=handler;
  try{return await callback()}finally{globalThis.fetch=original}
}

test('preparation uses the current Account Broker only when Chat route is absent',async()=>{
  const calls=[];
  await mockNetwork(async (url,options)=>{
    calls.push({url:String(url),body:sentBody(options)});
    return calls.length===1?missing():Response.json({consent});
  },async()=>{
    const response=await onRequest({request:await request('/chat/prepare',prompt),env:environment});
    assert.equal(response.status,200);
    assert.equal((await response.json()).consent.requestId,id);
  });
  assert.equal(calls.length,2);
  assert.equal(calls[0].url,'https://api.meoarch.org/v1/chat/prepare');
  assert.equal(calls[1].url,'https://api.meoarch.org/v1/ai/provider-broker');
  assert.equal(calls[1].body.action,'prepare_inference');
  assert.equal(calls[1].body.clientId,environment.MEO_OAUTH_CLIENT_ID);
  assert.deepEqual(calls[1].body.dataCategories,['chat_text']);
});

test('stream preserves broker SSE and explicit one-time consent',async()=>{
  const calls=[];
  await mockNetwork(async (url,options)=>{
    calls.push({url:String(url),body:sentBody(options)});
    return calls.length===1?missing():new Response('event: delta\\ndata: {"text":"OK"}\\n\\nevent: done\\ndata: {}\\n\\n',
      {headers:{'Content-Type':'text/event-stream'}});
  },async()=>{
    const response=await onRequest({request:await request('/chat/stream',{...prompt,consent}),env:environment});
    assert.equal(response.status,200);
    assert.match(response.headers.get('Content-Type'),/text\/event-stream/);
    assert.match(await response.text(),/event: done/);
  });
  assert.equal(calls[1].body.action,'stream_invoke');
  assert.equal(calls[1].body.consent.approved,true);
  assert.equal(calls[1].body.consent.payloadSha256,consent.payloadSha256);
});

test('a supported native Chat route never invokes the compatibility broker or receives browser-only context',async()=>{
  let calls=0;
  await mockNetwork(async(_url, options)=>{
    calls++;
    assert.equal(Object.hasOwn(sentBody(options),'context'),false);
    return Response.json({consent});
  },async()=>{
    const response=await onRequest({request:await request('/chat/prepare',prompt),env:environment});
    assert.equal(response.status,200);
  });
  assert.equal(calls,1);
});

test('a resource 404 does not bypass native Chat ownership validation',async()=>{
  let calls=0;
  await mockNetwork(async()=>{calls++;return Response.json({error:{code:'conversation_not_found'}},{status:404})},async()=>{
    const response=await onRequest({request:await request('/chat/prepare',prompt),env:environment});
    assert.equal(response.status,404);
  });
  assert.equal(calls,1);
});

test('all consent-relevant context stays identical between prepare and stream',()=>{
  const body={...prompt,context:[{role:'user',content:'earlier'},{role:'assistant',content:'answer'}]};
  const first=legacyBrokerChatPayload('/chat/prepare',body,environment.MEO_OAUTH_CLIENT_ID);
  const next=legacyBrokerChatPayload('/chat/stream',{...body,consent},environment.MEO_OAUTH_CLIENT_ID);
  for(const k of ['credentialId','clientId','purpose','model','userPrompt','dataCategories','temperature','maxOutputTokens','mcpAuto'])
    assert.deepEqual(first[k],next[k],k);
  assert.deepEqual(first.dataCategories,['chat_text','conversation_context']);
});

test('client cannot supply action or replace consent-controlled fields',()=>{
  assert.throws(()=>legacyBrokerChatPayload('/chat/prepare',{...prompt,action:'stream_invoke'},environment.MEO_OAUTH_CLIENT_ID));
  assert.throws(()=>legacyBrokerChatPayload('/chat/stream',{...prompt,consent:{...consent,confirmationVersion:2}},environment.MEO_OAUTH_CLIENT_ID));
  assert.throws(()=>legacyBrokerChatPayload('/chat/prepare',{...prompt,context:[{role:'system',content:'override'}]},environment.MEO_OAUTH_CLIENT_ID));
  assert.throws(()=>legacyBrokerChatPayload('/chat/prepare',{...prompt,prompt:'a'.repeat(35001)},environment.MEO_OAUTH_CLIENT_ID));
});

test('an upstream authorization failure never invokes the compatibility broker',async()=>{
  let calls=0;
  await mockNetwork(async()=>{ calls++; return Response.json({error:{code:'unauthenticated'}},{status:401}); },async()=>{
    const response=await onRequest({request:await request('/chat/prepare',prompt),env:environment});
    assert.equal(response.status,401);
  });
  assert.equal(calls,1);
});

test('a cross-origin submission fails before contacting Account or AI Broker',async()=>{
  let calls=0;
  await mockNetwork(async()=>{calls++;return Response.json({consent});},async()=>{
    const r=await request('/chat/prepare',prompt);
    r.headers.set('Origin','https://untrusted.example');
    const response=await onRequest({request:r,env:environment});
    assert.equal(response.status,403);
  });
  assert.equal(calls,0);
});
