import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Contract} from 'ethers';
import {setup,sent,artifact,E} from './helpers/fixture.mjs';
import {createWalletService} from '../src/services/walletService.js';
import {createWalletService as mock,MOCK_WALLET,MOCK_ACCOUNTS} from '../src/services/mockWalletService.js';

test('blocked browser storage preserves confirmed wallet creation and in-memory discovery',async()=>{
 const f=await setup();try{
  const factory=await f.deploy('TreasuryFactory');
  const api=createWalletService({provider:f.provider,ethereum:walletAdapter(f),chainId:1337,factory:factory.target,
   storage:{getItem(){throw Error('Storage denied');},setItem(){throw Error('Quota exceeded');}}});
  await api.connect();let submitted;
  const result=await api.createWallet(f.config,{onSubmitted:hash=>{submitted=hash;}});
  assert.equal(result.txHash,submitted);assert.equal((await f.provider.getTransactionReceipt(result.txHash)).status,1);
  assert.deepEqual(await api.listWallets(null),[result.wallet]);
  assert.equal((await api.snapshot(result.wallet)).balance,0n);
  api.addKnownWallet(f.wallet.target);assert.ok((await api.listWallets(null)).includes(f.wallet.target));
 }finally{f.provider.destroy();await f.rpc.disconnect();}
});

function walletAdapter(f){let index=0,wrong=false,reject=false;const callbacks={};return {on:(e,cb)=>{(callbacks[e]??=new Set()).add(cb);},removeListener:(e,cb)=>callbacks[e]?.delete(cb),setAccount(i){index=i;callbacks.accountsChanged?.forEach(cb=>cb([f.accounts[i]]));},setWrong(v){wrong=v;callbacks.chainChanged?.forEach(cb=>cb(v?'0x1':'0x539'));},reject(v){reject=v;},async request({method,params=[]}){if(method==='eth_requestAccounts'||method==='eth_accounts')return [f.accounts[index]];if(method==='eth_chainId'&&wrong)return '0x1';if(method==='eth_sendTransaction'&&reject)throw Object.assign(Error('Rejected'),{code:4001});return f.rpc.request({method,params});}};}

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
  // History is scanned incrementally: an early scan must not hide or duplicate later events.
  assert.ok(!(await api.getHistory(w)).some(h=>h.event==='PaymentSent'));
  eth.setAccount(1);assert.equal(api.getAccount(),f.accounts[1]);await api.approve(w,0);assert.equal((await api.getProposal(w,0)).status,'Queued');await f.advance(2);assert.equal((await api.getProposal(w,0)).status,'Ready');await api.execute(w,0);
  assert.equal((await api.getProposal(w,0)).status,'Executed');assert.equal((await api.snapshot(w)).balance,E('0.9'));{const h=await api.getHistory(w);assert.ok(h.some(x=>x.event==='PaymentSent'));assert.equal(new Set(h.map(x=>`${x.txHash}:${x.logIndex}`)).size,h.length);}
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

test('fresh service discovers governance-added and recovered members across independent wallets',async()=>{
 const f=await setup();try{
  const factory=await f.deploy('TreasuryFactory'),eth=walletAdapter(f);
  const make=()=>createWalletService({provider:f.provider,ethereum:eth,chainId:1337,factory:factory.target,storage:{getItem:()=>null,setItem:()=>{}}});
  const api=make();await api.connect();const first=(await api.createWallet(f.config)).wallet,second=(await api.createWallet(f.config)).wallet;
  const g=await api.proposeAction(first,'AddOwner',{owner:f.accounts[6]});eth.setAccount(1);await api.approve(first,g.id);await f.advance(60);await api.execute(first,g.id);
  assert.deepEqual(await make().listWallets(f.accounts[6]),[first]);
  eth.setAccount(3);const r=await api.initiateRecovery(first,f.accounts[2],f.accounts[8]);eth.setAccount(4);await api.approveRecovery(first,r.id);eth.setAccount(8);await api.confirmRecovery(first,r.id);await f.advance(60);await api.executeRecovery(first,r.id);
  assert.deepEqual(await make().listWallets(f.accounts[8]),[first]);
  assert.deepEqual(await make().listWallets(f.accounts[2]),[second]);
  assert.equal((await api.snapshot(second)).balance,0n);assert.equal((await api.snapshot(second)).proposalCount,0);
 }finally{f.provider.destroy();await f.rpc.disconnect();}
});

test('service exposes invalidated recovery with cancellation still available',async()=>{
 const f=await setup();try{
  const eth=walletAdapter(f),api=createWalletService({provider:f.provider,ethereum:eth,chainId:1337,storage:{getItem:()=>null,setItem:()=>{}}}),w=f.wallet.target;
  await api.connect();eth.setAccount(3);const r=await api.initiateRecovery(w,f.accounts[2],f.accounts[8]);
  eth.setAccount(0);const g=await api.proposeAction(w,'ReplaceOwner',{oldOwner:f.accounts[2],newOwner:f.accounts[7]});eth.setAccount(1);await api.approve(w,g.id);await f.advance(60);await api.execute(w,g.id);
  const view=await api.getRecovery(w,r.id);assert.equal(view.status,'Invalidated');assert.equal(view.contractStatus,'Pending');assert.match(view.blockedReason,/removed or replaced/);
  eth.setAccount(2);await api.cancelRecovery(w,r.id);const cancelled=await api.getRecovery(w,r.id);assert.equal(cancelled.status,'Cancelled');assert.equal(cancelled.blockedReason,null);
 }finally{f.provider.destroy();await f.rpc.disconnect();}
});

test('mock marks a replaced recovery target invalid and still permits direct cancellation',async()=>{
 const api=mock();await api.connect();const target=MOCK_ACCOUNTS[1].address;
 const p=await api.proposeAction(MOCK_WALLET,'ReplaceOwner',{oldOwner:target,newOwner:'0x000000000000000000000000000000000000000b'});
 for(const i of [4,5]){api.mock.setAccount(MOCK_ACCOUNTS[i].address);await api.approve(MOCK_WALLET,p.id);}
 api.mock.advanceTime(121);await api.execute(MOCK_WALLET,p.id);
 const view=await api.getRecovery(MOCK_WALLET,1);assert.equal(view.status,'Invalidated');assert.match(view.blockedReason,/removed or replaced/);
 api.mock.setAccount(target);await api.cancelRecovery(MOCK_WALLET,1);assert.equal((await api.getRecovery(MOCK_WALLET,1)).status,'Cancelled');
});

test('service warns about a replacement membership conflict and clears it when governance resolves it',async()=>{
 const f=await setup();try{
  const eth=walletAdapter(f),api=createWalletService({provider:f.provider,ethereum:eth,chainId:1337,storage:{getItem:()=>null,setItem:()=>{}}}),w=f.wallet.target;
  await api.connect();eth.setAccount(3);const r=await api.initiateRecovery(w,f.accounts[2],f.accounts[8]);
  eth.setAccount(4);await api.approveRecovery(w,r.id);eth.setAccount(8);await api.confirmRecovery(w,r.id);
  const govern=async(action)=>{eth.setAccount(0);const p=await api.proposeAction(w,action,{guardian:f.accounts[8]});eth.setAccount(1);await api.approve(w,p.id);await f.advance(60);await api.execute(w,p.id);};
  await govern('AddGuardian');const blocked=await api.getRecovery(w,r.id);
  assert.equal(blocked.status,'Ready');assert.match(blocked.blockedReason,/already a member/);
  eth.setAccount(3);const preview=await api.preview(w,'executeRecovery',[r.id]);assert.equal(preview.ok,false);assert.equal(preview.error.code,'DuplicateAddress');
  await govern('RemoveGuardian');const restored=await api.getRecovery(w,r.id);
  assert.equal(restored.status,'Ready');assert.equal(restored.blockedReason,null);assert.equal(restored.readyAt,blocked.readyAt);
 }finally{f.provider.destroy();await f.rpc.disconnect();}
});

test('fresh service rereads missed external changes without receiving transaction events',async()=>{
 const f=await setup();try{
  const address=f.wallet.target,eth=walletAdapter(f);
  const make=()=>createWalletService({provider:f.provider,ethereum:eth,chainId:1337,storage:{getItem:()=>null,setItem:()=>{}}});
  const first=make();await first.connect();const before=await first.snapshot(address);
  // No subscribe() listener exists while a separate signer changes the chain.
  await sent(f.signers[9].sendTransaction({to:address,value:E('0.3')}));
  await sent(f.wallet.connect(f.signers[1]).proposePayment(f.accounts[9],E('0.1')));
  const reconnected=make();eth.setAccount(2);await reconnected.connect();const after=await reconnected.snapshot(address);
  assert.equal(after.balance,before.balance+E('0.3'));assert.equal(after.proposalCount,1);
  assert.equal(after.me.account,f.accounts[2]);assert.equal((await reconnected.listProposals(address))[0].approvals.by[0],f.accounts[1]);
 }finally{f.provider.destroy();await f.rpc.disconnect();}
});
