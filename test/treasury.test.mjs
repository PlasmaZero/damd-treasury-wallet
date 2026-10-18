import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {ZeroAddress,Contract,ContractFactory} from 'ethers';
import fc from 'fast-check';
import {setup,sent,events,expectRevert,artifact,E} from './helpers/fixture.mjs';
import {ACTION_TYPES,encodeParams,decodeParams,ACTION_NAMES,FIELDS} from '../src/contract/params.js';
let f,snapshot,w,a,s;
before(async()=>{f=await setup();w=f.wallet;a=f.accounts;s=f.signers;snapshot=await f.rpc.request({method:'evm_snapshot',params:[]});});
beforeEach(async()=>{await f.rpc.request({method:'evm_revert',params:[snapshot]});snapshot=await f.rpc.request({method:'evm_snapshot',params:[]});});
after(async()=>{f.provider.destroy();await f.rpc.disconnect();});
const fail=(p,n)=>expectRevert(p,n,w.interface);
async function payment(amount=E('0.1'),recipient=a[9]) {const id=Number(await w.proposalCount());await sent(w.proposePayment(recipient,amount));return id;}
async function quorum(id){await sent(w.connect(s[1]).approve(id));return w.getProposal(id);}
async function execute(id){const p=await w.getProposal(id);await f.mineAt(p.readyAt);await sent(w.execute(id));}
async function gov(name,params){const id=Number(await w.proposalCount());await sent(w.proposeAction(ACTION_TYPES[name],encodeParams(name,params)));await quorum(id);await execute(id);return id;}
async function recovery(old=a[2],replacement=a[8]) {const id=Number(await w.recoveryCount());await sent(w.connect(s[3]).initiateRecovery(old,replacement));return id;}
async function queueRecovery(id){await sent(w.connect(s[4]).approveRecovery(id));return w.getRecovery(id);}

test('constructor rejects zero, duplicate, overlapping members and invalid configuration',async()=>{
 const c=f.config,art=artifact('Treasury'),factory=new ContractFactory(art.abi,art.bytecode,s[0]);
 const cases=[ [{...c,owners:[ZeroAddress,a[1]]},'InvalidAddress'],[{...c,owners:[a[0],a[0]]},'DuplicateAddress'],[{...c,guardians:[a[0]]},'RoleOverlap'],[{...c,threshold:0},'InvalidThreshold'],[{...c,threshold:4},'InvalidThreshold'],[{...c,guardianThreshold:0},'InvalidThreshold'],[{...c,limits:{...c.limits,smallTierCap:0}},'InvalidLimits'],[{...c,delays:{...c.delays,governanceDelay:59}},'InvalidDelays'],[{...c,delays:{...c.delays,proposalTTL:60}},'InvalidDelays'] ];
 for(const [config,error]of cases)await fail(factory.deploy(config),error);
});
test('constructor emits configuration events; fresh balance zero; deposits emit sender and amount',async()=>{
 const fresh=await f.deploy('Treasury',[f.config]);assert.equal(await f.provider.getBalance(await fresh.getAddress()),0n);
 const creation=await fresh.deploymentTransaction().wait();assert.ok(events(creation,w.interface).includes('DelaysChanged'));
 const r=await sent(s[8].sendTransaction({to:await fresh.getAddress(),value:E('0.3')}));
 const e=w.interface.parseLog(r.logs[0]);assert.equal(e.name,'Deposited');assert.equal(e.args.from,a[8]);assert.equal(e.args.amount,E('0.3'));
 await sent(s[9].sendTransaction({to:await fresh.getAddress(),value:E('0.2')}));assert.equal(await f.provider.getBalance(await fresh.getAddress()),E('0.5'));
});
test('proposer auto-approves; threshold one queues with exact event order',async()=>{
 const single=await f.deploy('Treasury',[{...f.config,owners:[a[0]],threshold:1}]);const r=await sent(single.proposePayment(a[9],1n));
 assert.deepEqual(events(r,w.interface),['ProposalCreated','Approved','Queued']);assert.equal(await single.liveApprovals(0),1n);
});
test('outsiders cannot propose, approve, revoke, cancel, execute or initiate recovery',async()=>{
 const id=await payment(),o=w.connect(s[9]);for(const p of [()=>o.proposePayment.staticCall(a[8],1),()=>o.approve.staticCall(id),()=>o.revokeApproval.staticCall(id),()=>o.voteCancel.staticCall(id),()=>o.execute.staticCall(id)]) await fail(p(),'NotOwner');
 await fail(o.initiateRecovery.staticCall(a[0],a[8]),'NotGuardian');
});
test('rejects zero amount, invalid recipient, self recipient and over-cap payment',async()=>{
 await fail(w.proposePayment.staticCall(a[9],0),'AmountZero');await fail(w.proposePayment.staticCall(ZeroAddress,1),'InvalidAddress');await fail(w.proposePayment.staticCall(await w.getAddress(),1),'InvalidAddress');await fail(w.proposePayment.staticCall(a[9],E('2')+1n),'AboveTxCap');await payment(E('2'));
});
test('unknown ids report typed errors',async()=>{await fail(w.getProposal(999),'UnknownProposal');await fail(w.getRecovery(999),'UnknownRecovery');});
test('duplicate approvals fail; pending approval can be revoked and re-added',async()=>{
 const id=await payment();await fail(w.approve.staticCall(id),'AlreadyApproved');await fail(w.connect(s[1]).revokeApproval.staticCall(id),'NotApproved');await sent(w.revokeApproval(id));assert.equal(await w.liveApprovals(id),0n);await sent(w.approve(id));assert.equal(await w.liveApprovals(id),1n);
});
test('quorum starts the tiered timelock; extra approvals do not restart it; queued revoke fails',async()=>{
 const id=await payment(E('1'));await fail(w.execute.staticCall(id),'WrongStatus');const p=await quorum(id);assert.equal(p.readyAt-p.createdAt,5n);await f.advance(1);await sent(w.connect(s[2]).approve(id));assert.equal((await w.getProposal(id)).readyAt,p.readyAt);await fail(w.revokeApproval.staticCall(id),'WrongStatus');
});
test('exactly readyAt-1 fails and exactly readyAt succeeds; payment executes once',async()=>{
 const id=await payment();const p=await quorum(id);await f.mineAt(p.readyAt-1n);await fail(w.execute.staticCall(id),'TimelockActive');await f.mineAt(p.readyAt);await w.execute.staticCall(id);const before=await f.provider.getBalance(a[9]);const r=await sent(w.execute(id));assert.equal(await f.provider.getBalance(a[9])-before,E('0.1'));assert.deepEqual(events(r,w.interface),['PaymentSent','Executed']);await fail(w.execute.staticCall(id),'WrongStatus');
});
test('expiry is derived, inclusive at expiresAt and rejected after expiresAt',async()=>{
 const id=await payment();const p=await quorum(id);await f.mineAt(p.expiresAt);await w.execute.staticCall(id);await f.mineAt(p.expiresAt+1n);assert.equal((await w.getProposal(id)).status,4n);await fail(w.execute.staticCall(id),'RequestExpired');await fail(w.connect(s[2]).approve.staticCall(id),'RequestExpired');
});
test('daily cap exact boundary, +1 wei failure, then reset at next UTC epoch',async()=>{
 for(const amount of [E('2'),E('2'),E('1')]){const id=await payment(amount);await quorum(id);await execute(id);}assert.equal(await w.spentToday(),E('5'));assert.equal(await w.remainingToday(),0n);
 const id=await payment(1n);await quorum(id);await f.advance(5);await fail(w.execute.staticCall(id),'DailyCapExceeded');
 // Long-lived proposal to exercise the next epoch without expiring.
 await gov('SetDelays',{...f.config.delays,proposalTTL:172800});const next=await payment(1n);await quorum(next);
 await f.mineAt((await w.currentDay()+1n)*86400n);assert.equal(await w.spentToday(),0n);await sent(w.execute(next));assert.equal(await w.spentToday(),1n);
});
test('insufficient balance leaves proposal queued and funds unchanged',async()=>{
 const fresh=await f.deploy('Treasury',[f.config]);await sent(fresh.proposePayment(a[9],1));await sent(fresh.connect(s[1]).approve(0));await f.advance(2);await fail(fresh.execute.staticCall(0),'InsufficientBalance');assert.equal((await fresh.getProposal(0)).status,1n);
});
test('reverting recipient rolls back status and spend accounting',async()=>{
 const bad=await f.deploy('RevertingReceiver'),id=await payment(1n,await bad.getAddress());await quorum(id);await f.advance(2);await fail(w.execute.staticCall(id),'TransferFailed');assert.equal(await w.spentToday(),0n);assert.equal((await w.getProposal(id)).status,1n);
});
test('reentrancy into execute, approve and executeRecovery is blocked',async()=>{
 const bad=await f.deploy('ReenteringReceiver');await gov('AddOwner',{owner:await bad.getAddress()});await gov('AddGuardian',{guardian:a[10]});
 for(let mode=0;mode<3;mode++){const id=await payment(1n,await bad.getAddress());await sent(bad.configure(await w.getAddress(),id,mode));await quorum(id);await execute(id);assert.equal(await bad.attempted(),true);assert.equal(await bad.succeeded(),false);}
});
test('blocking minority N-M+1 cancels, one vote and duplicate vote cannot',async()=>{
 const id=await payment();await quorum(id);await sent(w.voteCancel(id));assert.equal((await w.getProposal(id)).status,1n);await fail(w.voteCancel.staticCall(id),'AlreadyVoted');const r=await sent(w.connect(s[2]).voteCancel(id));assert.deepEqual(events(r,w.interface),['CancelVoted','Cancelled']);await fail(w.execute.staticCall(id),'WrongStatus');
});
test('all governance ActionTypes execute through approvals and old governance delay',async()=>{
 await gov('AddOwner',{owner:a[6]});assert.equal(await w.isOwner(a[6]),true);
 await gov('RemoveOwner',{owner:a[6]});assert.equal(await w.isOwner(a[6]),false);
 await gov('ReplaceOwner',{oldOwner:a[2],newOwner:a[7]});assert.equal(await w.isOwner(a[7]),true);
 await gov('SetThreshold',{threshold:1});assert.equal((await w.getConfig()).threshold,1n);
 // threshold now one, so use direct proposals to avoid redundant approvals.
 async function single(name,params){const id=Number(await w.proposalCount());await sent(w.proposeAction(ACTION_TYPES[name],encodeParams(name,params)));await execute(id);}
 await single('AddGuardian',{guardian:a[10]});assert.equal(await w.isGuardian(a[10]),true);
 await single('RemoveGuardian',{guardian:a[10]});assert.equal(await w.isGuardian(a[10]),false);
 await single('SetGuardianThreshold',{guardianThreshold:1});assert.equal((await w.getConfig()).guardianThreshold,1n);
 await single('SetLimits',{perTxCap:E('1'),dailyCap:E('3'),smallTierCap:E('0.2')});assert.equal((await w.getConfig()).limits.dailyCap,E('3'));
 const id=Number(await w.proposalCount());await sent(w.proposeAction(ACTION_TYPES.SetDelays,encodeParams('SetDelays',{...f.config.delays,governanceDelay:70,recoveryDelay:80})));const p=await w.getProposal(id);assert.equal(p.readyAt-p.createdAt,60n);await execute(id);assert.equal((await w.getConfig()).delays.governanceDelay,70n);
});
test('invalid governance actions, payloads, role overlaps and thresholds are rejected',async()=>{
 await fail(w.proposeAction.staticCall(0,encodeParams('Payment',{recipient:a[9],amount:1})),'InvalidAction');
 await fail(w.proposeAction.staticCall(1,'0x12'),'InvalidAction');
 const cases=[['AddOwner',{owner:a[3]},'RoleOverlap'],['AddGuardian',{guardian:a[0]},'RoleOverlap'],['RemoveOwner',{owner:a[8]},'NotOwner'],['RemoveGuardian',{guardian:a[8]},'NotGuardian'],['ReplaceOwner',{oldOwner:a[8],newOwner:a[9]},'NotOwner'],['SetThreshold',{threshold:4},'InvalidThreshold'],['SetGuardianThreshold',{guardianThreshold:0},'InvalidThreshold'],['SetLimits',{perTxCap:3,dailyCap:2,smallTierCap:1},'InvalidLimits'],['SetDelays',{...f.config.delays,recoveryDelay:59},'InvalidDelays']];
 for(const [name,params,error]of cases)await fail(w.proposeAction.staticCall(ACTION_TYPES[name],encodeParams(name,params)),error);
 await gov('SetThreshold',{threshold:3});await fail(w.proposeAction.staticCall(2,encodeParams('RemoveOwner',{owner:a[2]})),'InvalidThreshold');
});
test('removed owner votes stop counting and do not revive after re-addition',async()=>{
 await gov('SetDelays',{...f.config.delays,proposalTTL:1000});
 const id=await payment();await sent(w.connect(s[2]).approve(id));await gov('RemoveOwner',{owner:a[2]});assert.equal(await w.liveApprovals(id),1n);
 await gov('AddOwner',{owner:a[2]});assert.equal(await w.liveApprovals(id),1n);await fail(w.execute.staticCall(id),'BelowThreshold');await sent(w.connect(s[2]).approve(id));await sent(w.execute(id));
});
test('higher threshold and changed payment caps apply at execution',async()=>{
 const id=await payment(E('1'));await quorum(id);await gov('SetThreshold',{threshold:3});await fail(w.execute.staticCall(id),'BelowThreshold');await sent(w.connect(s[2]).approve(id));
 const g=Number(await w.proposalCount());await sent(w.proposeAction(8,encodeParams('SetLimits',{perTxCap:E('0.5'),dailyCap:E('5'),smallTierCap:E('0.1')})));await sent(w.connect(s[1]).approve(g));await sent(w.connect(s[2]).approve(g));await execute(g);
 // Original expires at 120 seconds, inclusive.
 await fail(w.execute.staticCall(id),'AboveTxCap');
});
test('recovery initiation auto-approves, requires guardians, and reserves both addresses',async()=>{
 const id=await recovery();assert.equal(await w.liveRecoveryApprovals(id),1n);await fail(w.connect(s[3]).approveRecovery.staticCall(id),'AlreadyApproved');await fail(w.connect(s[0]).approveRecovery.staticCall(id),'NotGuardian');await fail(w.connect(s[3]).initiateRecovery.staticCall(a[2],a[7]),'RecoveryAlreadyActive');await fail(w.connect(s[3]).initiateRecovery.staticCall(a[1],a[8]),'RecoveryAlreadyActive');
 for(const newOwner of [ZeroAddress,a[0],a[3]])await fail(w.connect(s[3]).initiateRecovery.staticCall(a[2],newOwner),newOwner===ZeroAddress?'InvalidAddress':'DuplicateAddress');
});
test('recovery requires quorum, exact timelock, new-owner confirmation; replaces only one seat',async()=>{
 const id=await recovery();await fail(w.connect(s[3]).executeRecovery.staticCall(id),'WrongStatus');const r=await queueRecovery(id);await fail(w.connect(s[9]).confirmRecovery.staticCall(id),'NotAuthorized');await f.mineAt(r.readyAt-1n);await fail(w.connect(s[3]).executeRecovery.staticCall(id),'TimelockActive');await f.mineAt(r.readyAt);await fail(w.connect(s[3]).executeRecovery.staticCall(id),'NewOwnerNotConfirmed');await sent(w.connect(s[8]).confirmRecovery(id));
 const balance=await f.provider.getBalance(await w.getAddress()),cfg=await w.getConfig();const tx=await sent(w.connect(s[8]).executeRecovery(id));assert.deepEqual(events(tx,w.interface),['OwnerReplaced','RecoveryExecuted']);assert.equal(await w.isOwner(a[2]),false);assert.equal(await w.isOwner(a[8]),true);assert.equal(await f.provider.getBalance(await w.getAddress()),balance);const after=await w.getConfig();assert.deepEqual([...after.guardians],[...cfg.guardians]);assert.equal(after.threshold,cfg.threshold);assert.equal((await w.activeRecoveryFor(a[2]))[0],false);await fail(w.connect(s[8]).executeRecovery.staticCall(id),'WrongStatus');
});
test('old owner cancels directly; other owners need M votes and target cannot double count',async()=>{
 let id=await recovery();await sent(w.connect(s[2]).cancelRecovery(id));assert.equal((await w.getRecovery(id)).status,3n);
 id=await recovery();await fail(w.connect(s[2]).voteCancelRecovery.staticCall(id),'NotAuthorized');await sent(w.voteCancelRecovery(id));assert.equal((await w.getRecovery(id)).status,0n);await fail(w.voteCancelRecovery.staticCall(id),'AlreadyVoted');await sent(w.connect(s[1]).voteCancelRecovery(id));assert.equal((await w.getRecovery(id)).status,3n);
});
test('expired recovery frees old and new address reservations without cleanup transaction',async()=>{
 const id=await recovery();await f.advance(121);assert.equal((await w.getRecovery(id)).status,4n);assert.equal((await w.activeRecoveryFor(a[2]))[0],false);await fail(w.connect(s[3]).approveRecovery.staticCall(id),'RequestExpired');await recovery();
});
test('removed guardian approval no longer counts; new guardian can restore quorum',async()=>{
 const id=await recovery();await queueRecovery(id);await sent(w.connect(s[8]).confirmRecovery(id));await gov('RemoveGuardian',{guardian:a[4]});assert.equal(await w.liveRecoveryApprovals(id),1n);await fail(w.connect(s[3]).executeRecovery.staticCall(id),'BelowThreshold');await sent(w.connect(s[5]).approveRecovery(id));await sent(w.connect(s[3]).executeRecovery(id));
});
test('governance replacing old owner blocks stale recovery execution',async()=>{
 const id=await recovery();await queueRecovery(id);await sent(w.connect(s[8]).confirmRecovery(id));await gov('ReplaceOwner',{oldOwner:a[2],newOwner:a[7]});await fail(w.connect(s[3]).executeRecovery.staticCall(id),'NotOwner');
});
test('recovery invalidates old owner proposal approval',async()=>{
 const p=await payment();await sent(w.connect(s[2]).approve(p));const r=await recovery();await queueRecovery(r);await sent(w.connect(s[8]).confirmRecovery(r));await f.advance(60);await sent(w.connect(s[3]).executeRecovery(r));assert.equal(await w.liveApprovals(p),1n);await fail(w.execute.staticCall(p),'BelowThreshold');
});
test('factory registers all creation members, emits wallet, enforces constructor checks',async()=>{
 const factory=await f.deploy('TreasuryFactory');const r=await sent(factory.connect(s[9]).createWallet(f.config));const e=r.logs.map(l=>{try{return factory.interface.parseLog(l);}catch{return null;}}).find(e=>e?.name==='WalletCreated');const fresh=new Contract(e.args.wallet,artifact('Treasury').abi,s[0]);for(const member of [...f.config.owners,...f.config.guardians])assert.deepEqual([...(await factory.walletsOf(member))],[e.args.wallet]);assert.equal(await fresh.isOwner(a[9]),false);await fail(factory.createWallet.staticCall({...f.config,threshold:0}),'InvalidThreshold');
});
test('all parameter encodings round-trip including every ActionType',()=>{
 const data={recipient:a[9],amount:1n,owner:a[8],oldOwner:a[0],newOwner:a[8],threshold:2n,guardian:a[6],guardianThreshold:2n,...f.config.limits,...f.config.delays};
 for(const name of ACTION_NAMES){const obj=Object.fromEntries(FIELDS[name].map(k=>[k,data[k]]));const decoded=decodeParams(name,encodeParams(name,obj));for(const key of FIELDS[name])assert.equal(String(decoded[key]),String(obj[key]));}
});
test('random payment sequences preserve at-most-once, quorum, timelock and daily-spend invariants',async()=>{
 await fc.assert(fc.asyncProperty(fc.array(fc.record({amount:fc.integer({min:1,max:2500}),approve:fc.boolean(),cancel:fc.boolean()}),{minLength:3,maxLength:8}),async steps=>{
   const checkpoint=await f.rpc.request({method:'evm_snapshot',params:[]});
   try {let paid=0n;const initial=await f.provider.getBalance(await w.getAddress());
    for(const step of steps){const amount=BigInt(step.amount)*10n**15n;
     if(amount>E('2')){await fail(w.proposePayment.staticCall(a[9],amount),'AboveTxCap');continue;}
     const id=await payment(amount);if(step.approve)await quorum(id);if(step.cancel){await sent(w.voteCancel(id));await sent(w.connect(s[1]).voteCancel(id));}
     await f.advance(5);const p=await w.getProposal(id);
     if(p.status===1n&&paid+amount<=E('5')){await sent(w.execute(id));paid+=amount;await fail(w.execute.staticCall(id),'WrongStatus');}
     else if(p.status===1n)await fail(w.execute.staticCall(id),'DailyCapExceeded');
     else await fail(w.execute.staticCall(id),'WrongStatus');
     assert.equal(await w.spentToday(),paid);assert.equal(initial-await f.provider.getBalance(await w.getAddress()),paid);assert.ok(paid<=E('5'));
    }
   }finally{await f.rpc.request({method:'evm_revert',params:[checkpoint]});}
 }),{numRuns:6,seed:416});
});
