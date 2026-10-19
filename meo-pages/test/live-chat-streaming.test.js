import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleTranscript, appendAssistantChunk } from '../../client/src/components/Meo/streamingMessages.mjs';

test('long chats mount the last 48 messages initially', () => {
  assert.equal(visibleTranscript(1000),952);
  assert.equal(visibleTranscript(1000,96),904);
  assert.equal(visibleTranscript(47),0);
  assert.equal(visibleTranscript(48),0);
});

test('transcript bounds reject negative and non-finite values', () => {
  assert.equal(visibleTranscript(-1,20),0);
  assert.equal(visibleTranscript(Infinity,20),0);
  assert.equal(visibleTranscript(8,0),7);
});

test('assistant append retains historical references and does not mutate them', () => {
  const first={role:'user',content:'hello'};
  const second={role:'assistant',content:'a'};
  const input=Object.freeze([first,second]);
  const output=appendAssistantChunk(input,'bc');
  assert.equal(output[0],first);
  assert.equal(output[1].content,'abc');
  assert.equal(second.content,'a');
  assert.equal(input.length,2);
});

test('invalid append and empty chunks retain the original array', () => {
  const onlyUser=[{role:'user',content:'x'}];
  assert.equal(appendAssistantChunk(onlyUser,'y'),onlyUser);
  const assistant=[{role:'assistant',content:'x'}];
  assert.equal(appendAssistantChunk(assistant,''),assistant);
});
