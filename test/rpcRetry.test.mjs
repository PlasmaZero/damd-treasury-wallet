import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isMissingBlockError,withMissingBlockRetry} from '../src/services/rpcRetry.js';

// Shape ethers v6 produces for an unrecognised JSON-RPC error (as seen on the hosted site).
const missing=()=>Object.assign(new Error('could not coalesce error'),{code:'UNKNOWN_ERROR',error:{code:-32001,message:'block not found: 0xb81c78'}});

test('missing-block errors from a lagging load-balanced node are retried',async()=>{
  assert.ok(isMissingBlockError(missing()));
  assert.ok(isMissingBlockError({error:{code:-32000,message:'header not found'}}));
  assert.ok(!isMissingBlockError(new Error('execution reverted')));
  let calls=0;
  const provider=withMissingBlockRetry({send:async(method,params)=>{calls++;if(calls<3)throw missing();return [method,params];}},{delayMs:1});
  assert.deepEqual(await provider.send('eth_getCode',['0x1','0xb81c78']),['eth_getCode',['0x1','0xb81c78']]);
  assert.equal(calls,3);
  assert.equal(withMissingBlockRetry(provider),provider,'wrapping twice must not nest retries');
});

test('other errors and persistent missing blocks are not retried forever',async()=>{
  let calls=0;
  const reverting=withMissingBlockRetry({send:async()=>{calls++;throw new Error('execution reverted');}},{delayMs:1});
  await assert.rejects(reverting.send('eth_call',[]),/execution reverted/);
  assert.equal(calls,1);
  calls=0;
  const stuck=withMissingBlockRetry({send:async()=>{calls++;throw missing();}},{attempts:3,delayMs:1});
  await assert.rejects(stuck.send('eth_call',[]),e=>isMissingBlockError(e));
  assert.equal(calls,3);
});
