import '../scripts/compile.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,parseEther,ZeroAddress} from 'ethers';
const artifact=JSON.parse(fs.readFileSync('artifacts/Treasury.json','utf8'));
async function setup(t) {
  const rpc=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai'},wallet:{totalAccounts:5}});
  t.after(()=>rpc.disconnect());
  const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:0});provider.pollingInterval=10;
  const signers=await Promise.all([0,1,2,3,4].map(i=>provider.getSigner(i)));
  const owners=await Promise.all(signers.slice(0,3).map(s=>s.getAddress()));
  const factory=new ContractFactory(artifact.abi,artifact.bytecode,signers[0]);
  const c=await factory.deploy(owners,2,parseEther('1'),15);await c.waitForDeployment();
  const address=await c.getAddress(),recipient=await signers[4].getAddress();
  const send=async p=>(await p).wait();
  const fund=()=>send(signers[0].sendTransaction({to:address,value:parseEther('5')}));
  const propose=()=>send(c.propose(recipient,parseEther('0.1')));
  const approve=async()=>{await send(c.approve(0));await send(c.connect(signers[1]).approve(0));};
  const advance=async()=>{await rpc.request({method:'evm_increaseTime',params:[16]});await rpc.request({method:'evm_mine',params:[]});};
  return {rpc,provider,signers,owners,factory,c,address,recipient,send,fund,propose,approve,advance};
}
test('constructor rejects duplicate, zero and one-vote policies',async t=>{
  const {factory,owners}=await setup(t);
  for(const [list,n] of [[[owners[0],owners[0]],2],[[ZeroAddress,owners[1]],2],[owners,1],[owners,4]])await assert.rejects(factory.deploy(list,n,1n,15));
});
test('deposit changes balance and emits a deposit event',async t=>{
  const {c,provider,address,fund}=await setup(t);const r=await fund();
  assert.equal(await provider.getBalance(address),parseEther('5'));
  assert.equal(c.interface.parseLog(r.logs[0]).name,'Deposited');
});
test('outsiders cannot propose, approve or execute',async t=>{
  const {c,signers,recipient,propose}=await setup(t);await propose();const outsider=c.connect(signers[3]);
  await assert.rejects(outsider.propose(recipient,1n));await assert.rejects(outsider.approve(0));await assert.rejects(outsider.execute(0));
});
test('zero amount, zero recipient and above-limit payment fail',async t=>{
  const {c,recipient}=await setup(t);await assert.rejects(c.propose(recipient,0n));await assert.rejects(c.propose(ZeroAddress,1n));await assert.rejects(c.propose(recipient,parseEther('1.01')));
});
test('duplicate approvals do not increase the count',async t=>{
  const {c,propose,send}=await setup(t);await propose();await send(c.approve(0));await assert.rejects(c.approve(0));assert.equal((await c.payments(0)).approvals,1n);
});
test('threshold and timelock each block early execution',async t=>{
  const {c,propose,approve,fund}=await setup(t);await fund();await propose();await assert.rejects(c.execute(0));await approve();await assert.rejects(c.execute(0));
});
test('successful transfer executes once and emits an event',async t=>{
  const {c,provider,recipient,send,fund,propose,approve,advance}=await setup(t);await fund();await propose();await approve();await advance();const before=await provider.getBalance(recipient);const r=await send(c.execute(0));
  assert.equal(await provider.getBalance(recipient)-before,parseEther('0.1'));assert.equal((await c.payments(0)).executed,true);assert.equal(c.interface.parseLog(r.logs[0]).name,'PaymentExecuted');await assert.rejects(c.execute(0));
});
test('insufficient balance preserves the pending proposal',async t=>{
  const {c,propose,approve,advance}=await setup(t);await propose();await approve();await advance();await assert.rejects(c.execute(0));assert.equal((await c.payments(0)).executed,false);
});
test('extra approvals cannot restart the timelock',async t=>{
  const {c,signers,send,propose,approve,advance}=await setup(t);await propose();await approve();const ready=(await c.payments(0)).readyAt;await advance();await send(c.connect(signers[2]).approve(0));assert.equal((await c.payments(0)).readyAt,ready);
});
