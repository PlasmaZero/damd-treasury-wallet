import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifySource} from '../scripts/lib/explorer.mjs';
const version='v0.8.24+commit.e11b9ed9';
const options={address:'0x0000000000000000000000000000000000000001',contractName:'contracts/Treasury.sol:Treasury',
 constructorArguments:'0x1234',input:{language:'Solidity',sources:{},settings:{}},compilerVersion:version,
 apiKey:'test-secret',pause:async()=>{},attempts:5,intervalMs:0};
const published={status:'1',result:[{SourceCode:'contract Treasury {}',ABI:'[]',ContractName:'Treasury',CompilerVersion:version}]};
function queue(responses,inspect=()=>{}){let calls=0;return {get calls(){return calls;},fetcher:async(url,request)=>{
 inspect(url,request);assert.ok(calls<responses.length,'Unexpected explorer request');
 const body=responses[calls++];return {ok:true,status:200,json:async()=>body};}};}

test('explorer submits exact compiler input then waits for source publication',async()=>{
 const calls=[];const mock=queue([{status:'1',result:'guid'},{status:'0',result:'Pending in queue'},
 {status:'1',result:'Pass - Verified'},published],(url,request)=>calls.push({url,request}));
 const verified=await verifySource({...options,fetcher:mock.fetcher});
 assert.equal(verified.status,'verified');assert.equal(mock.calls,4);
 const body=calls[0].request.body;assert.equal(new URL(calls[0].url).origin,'https://api.etherscan.io');
 assert.equal(new URL(calls[0].url).searchParams.get('chainid'),'11155111');assert.equal(body.get('constructorArguments'),'1234');
 assert.equal(body.get('compilerversion'),version);assert.deepEqual(JSON.parse(body.get('sourceCode')),options.input);
});

test('already verified contracts still require retrievable matching compiler source',async()=>{
 const mock=queue([{status:'0',result:'Contract source code already verified'},published]);
 assert.equal((await verifySource({...options,fetcher:mock.fetcher})).status,'verified');
 const wrong=queue([{status:'0',result:'Already Verified'},{...published,result:[{...published.result[0],CompilerVersion:'v0.8.25'}]}]);
 await assert.rejects(verifySource({...options,fetcher:wrong.fetcher}),/compiler version mismatch/);
});

test('explorer retry is bounded when verification never leaves its queue',async()=>{
 const mock=queue([{status:'1',result:'guid'},{status:'0',result:'Pending in queue'}]);
 await assert.rejects(verifySource({...options,fetcher:mock.fetcher,attempts:2}),/timed out/);
});

test('explorer compile or bytecode failure fails the run and redacts credentials',async()=>{
 const mock=queue([{status:'0',result:'Bytecode mismatch test-secret'}]);
 await assert.rejects(verifySource({...options,fetcher:mock.fetcher}),e=>e.message.includes('rejected')&&!e.message.includes('test-secret'));
});

test('explorer API indexing delay retries submission rather than reporting a false pass',async()=>{
 const mock=queue([{status:'0',result:'Unable to locate ContractCode at address'},
 {status:'1',result:'guid'},{status:'1',result:'Pass - Verified'},published]);
 assert.equal((await verifySource({...options,fetcher:mock.fetcher})).status,'verified');assert.equal(mock.calls,4);
});
