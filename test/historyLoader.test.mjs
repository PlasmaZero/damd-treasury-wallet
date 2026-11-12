import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryLoader} from '../src/services/historyLoader.js';

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const event=(event,blockNumber=1)=>({event,blockNumber});

test('history publishes loading and the initial creation events without a connected account',async()=>{
  const pending=deferred(),states=[];
  const loader=createHistoryLoader(()=>pending.promise,s=>states.push(s));
  const read=loader.refresh();
  assert.deepEqual(states.at(-1),{items:[],loading:true,error:''});
  const items=[event('OwnerAdded'),event('GuardianAdded')];pending.resolve(items);await read;
  assert.deepEqual(states.at(-1),{items,loading:false,error:''});loader.dispose();
});

test('blocks arriving during a slow read coalesce without discarding its result',async()=>{
  const first=deferred(),next=deferred(),states=[];let calls=0;
  const loader=createHistoryLoader(()=>++calls===1?first.promise:next.promise,s=>states.push(s));
  const read=loader.refresh();
  for(let block=2;block<=12;block++)await loader.refresh();
  assert.equal(calls,1,'only one RPC history scan may be in flight');
  const initial=[event('OwnerAdded')];first.resolve(initial);await read;
  assert.equal(calls,2,'all newer blocks schedule one follow-up');
  assert.deepEqual(states.at(-1).items,initial,'the initial events are visible before the follow-up completes');
  const newer=[event('Deposited',12),...initial];next.resolve(newer);await next.promise;
  assert.deepEqual(states.at(-1),{items:newer,loading:false,error:''});loader.dispose();
});

test('failed history reads show a persistent error and a successful retry clears it',async()=>{
  const states=[];let calls=0;
  const loader=createHistoryLoader(async()=>{if(++calls===1)throw Error('RPC unavailable');return [event('Deposited')];},s=>states.push(s));
  await loader.refresh();assert.deepEqual(states.at(-1),{items:[],loading:false,error:'RPC unavailable'});
  await loader.refresh();assert.equal(states.at(-2).error,'RPC unavailable','retrying must not silently clear the failure');
  assert.deepEqual(states.at(-1),{items:[event('Deposited')],loading:false,error:''});loader.dispose();
});

test('background failures preserve the already loaded events',async()=>{
  const items=[event('OwnerAdded')],states=[];let fail=false;
  const loader=createHistoryLoader(async()=>{if(fail)throw Error('Rate limited');return items;},s=>states.push(s));
  await loader.refresh();fail=true;await loader.refresh();
  assert.deepEqual(states.at(-1),{items,loading:false,error:'Rate limited'});loader.dispose();
});

test('switching wallets prevents an old scan from overwriting the new wallet history',async()=>{
  const old=deferred(),oldStates=[],newStates=[];
  const previous=createHistoryLoader(()=>old.promise,s=>oldStates.push(s));
  const read=previous.refresh();previous.dispose();
  const current=createHistoryLoader(async()=>[event('GuardianAdded',9)],s=>newStates.push(s));
  await current.refresh();old.resolve([event('OwnerAdded')]);await read;
  assert.equal(oldStates.length,1,'the disposed wallet cannot publish a late result');
  assert.deepEqual(newStates.at(-1).items,[event('GuardianAdded',9)]);current.dispose();
});

test('leaving Activity stops queued reads and ignores late failures',async()=>{
  const pending=deferred(),states=[];let calls=0;
  const loader=createHistoryLoader(()=>{calls++;return pending.promise;},s=>states.push(s));
  const read=loader.refresh();await loader.refresh();loader.dispose();pending.reject(Error('Late RPC failure'));await read;await loader.refresh();
  assert.equal(calls,1);assert.equal(states.length,1);
});
