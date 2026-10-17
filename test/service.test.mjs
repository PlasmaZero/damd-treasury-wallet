import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Contract} from 'ethers';
import {setup,sent,artifact,E} from './helpers/fixture.mjs';
import {createWalletService} from '../src/services/walletService.js';
import {createWalletService as mock,MOCK_WALLET,MOCK_ACCOUNTS} from '../src/services/mockWalletService.js';

function walletAdapter(f){let index=0,wrong=false,reject=false;const callbacks={};return {on:(e,cb)=>{callbacks[e]=cb;},removeListener:()=>{},setAccount(i){index=i;callbacks.accountsChanged?.([f.accounts[i]]);},setWrong(v){wrong=v;callbacks.chainChanged?.(v?'0x1':'0x539');},reject(v){reject=v;},async request({method,params=[]}){if(method==='eth_requestAccounts'||method==='eth_accounts')return [f.accounts[index]];if(method==='eth_chainId'&&wrong)return '0x1';if(method==='eth_sendTransaction'&&reject)throw Object.assign(Error('Rejected'),{code:4001});return f.rpc.request({method,params});}};}

test('real service integrates creation, deposits, previews, approvals, execution, history and account changes',async()=>{
 const f=await setup();let api;
 try{
  const factory=await f.deploy('TreasuryFactory'),eth=walletAdapter(f),memory=new Map();api=createWalletService({provider:f.provider,ethereum:eth,chainId:1337,factory:await factory.getAddress(),storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}});
  await api.connect();let hash;
  const created=await api.createWallet(f.config,{onSubmitted:h=>{hash=h;}});assert.equal(hash,created.txHash);const w=created.wallet;
  assert.ok((await api.listWallets(f.accounts[0])).includes(w));assert.equal((await api.snapshot(w)).balance,0n);
  await api.deposit(w,E('1'));assert.equal((await api.snapshot(w)).balance,E('1'));
  const preview=await api.preview(w,'proposePayment',[f.accounts[9],E('3')]);assert.equal(preview.ok,false);assert.equal(preview.error.code,'AboveTxCap');
  const p=await api.proposePayment(w,f.accounts[9],E('0.1'));assert.equal(p.id,0);assert.equal((await api.getProposal(w,0)).approvals.count,1);
  eth.setAccount(1);assert.equal(api.getAccount(),f.accounts[1]);await api.approve(w,0);assert.equal((await api.getProposal(w,0)).status,'Queued');await f.advance(2);assert.equal((await api.getProposal(w,0)).status,'Ready');await api.execute(w,0);
  assert.equal((await api.getProposal(w,0)).status,'Executed');assert.equal((await api.snapshot(w)).balance,E('0.9'));assert.ok((await api.getHistory(w)).some(h=>h.event==='PaymentSent'));
  const proposals=await api.listProposals(w,{offset:0,limit:10});assert.equal(proposals.length,1);assert.deepEqual(await api.listProposals(w,{offset:10}),[]);
  eth.setWrong(true);await assert.rejects(api.connect(),e=>e.code==='WRONG_NETWORK');assert.equal(api.getAccount(),null);eth.setWrong(false);await api.connect();eth.reject(true);await assert.rejects(api.deposit(w,1n),e=>e.code==='USER_REJECTED');
 }finally{f.provider.destroy();await f.rpc.disconnect();}
});
test('real service recovery and governance use frozen data shape',async()=>{
 const f=await setup();try{
  const eth=walletAdapter(f),api=createWalletService({provider:f.provider,ethereum:eth,chainId:1337,storage:{getItem:()=>null,setItem:()=>{}}}),w=await f.wallet.getAddress();
  await api.connect();const g=await api.proposeAction(w,'SetLimits',{perTxCap:E('1'),dailyCap:E('4'),smallTierCap:E('0.2')});eth.setAccount(1);await api.approve(w,g.id);await f.advance(60);await api.execute(w,g.id);assert.equal((await api.snapshot(w)).config.limits.dailyCap,E('4'));
  eth.setAccount(3);const r=await api.initiateRecovery(w,f.accounts[2],f.accounts[8]);eth.setAccount(4);await api.approveRecovery(w,r.id);eth.setAccount(8);await api.confirmRecovery(w,r.id);await f.advance(60);await api.executeRecovery(w,r.id);assert.equal((await api.getRecovery(w,r.id)).status,'Executed');assert.equal((await api.snapshot(w)).me.roles.isOwner,true);
 }finally{f.provider.destroy();await f.rpc.disconnect();}
});
test('service filters stale factory memberships but preserves manually added wallets',async()=>{
 const f=await setup();try{
  const factory=await f.deploy('TreasuryFactory');const receipt=await sent(factory.createWallet(f.config));const event=receipt.logs.flatMap(l=>{try{return [factory.interface.parseLog(l)].filter(Boolean);}catch{return [];}}).find(e=>e.name==='WalletCreated');const address=event.args.wallet,w=new Contract(address,artifact('Treasury').abi,f.signers[0]);
  await sent(w.proposeAction(2,'0x'+f.accounts[2].slice(2).padStart(64,'0')));await sent(w.connect(f.signers[1]).approve(0));await f.advance(60);await sent(w.execute(0));
  const api=createWalletService({provider:f.provider,ethereum:walletAdapter(f),chainId:1337,factory:await factory.getAddress(),storage:{getItem:()=>null,setItem:()=>{}}});assert.deepEqual(await api.listWallets(f.accounts[2]),[]);api.addKnownWallet(address);assert.deepEqual(await api.listWallets(f.accounts[2]),[address]);
 }finally{f.provider.destroy();await f.rpc.disconnect();}
});
test('mock fixtures expose all statuses and target recovery; writes update mock balance only',async()=>{
 const api=mock();await api.connect();const list=await api.listProposals(MOCK_WALLET);for(const s of ['Pending','Queued','Ready','Executed','Cancelled','Expired'])assert.ok(list.some(p=>p.status===s));
 const before=await api.snapshot(MOCK_WALLET);await api.deposit(MOCK_WALLET,E('0.1'));assert.equal((await api.snapshot(MOCK_WALLET)).balance,before.balance+E('0.1'));
 api.mock.setAccount(MOCK_ACCOUNTS[1].address);assert.equal((await api.snapshot(MOCK_WALLET)).me.activeRecoveryAgainstMe,1);await api.cancelRecovery(MOCK_WALLET,1);assert.equal((await api.getRecovery(MOCK_WALLET,1)).status,'Cancelled');
});
test('mock previews never mutate state and reject unauthorized actions',async()=>{
 const api=mock();await api.connect();const before=(await api.snapshot(MOCK_WALLET)).balance;assert.equal((await api.preview(MOCK_WALLET,'deposit',[1n])).ok,true);assert.equal((await api.snapshot(MOCK_WALLET)).balance,before);api.mock.setAccount(MOCK_ACCOUNTS.at(-1).address);const result=await api.preview(MOCK_WALLET,'proposePayment',[MOCK_ACCOUNTS[0].address,1n]);assert.equal(result.error.code,'NotOwner');
});
