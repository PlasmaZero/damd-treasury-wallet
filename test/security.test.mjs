import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,sent,expectRevert,E} from './helpers/fixture.mjs';
import {ACTION_TYPES,encodeParams} from '../src/contract/params.js';

let f,w,s,a,snapshot;
before(async()=>{
  f=await setup();s=f.signers;a=f.accounts;
  w=await f.deploy('Treasury',[{...f.config,delays:{...f.config.delays,proposalTTL:1000,recoveryTTL:1000}}]);
  await sent(s[0].sendTransaction({to:w.target,value:E('20')}));
  snapshot=await f.rpc.request({method:'evm_snapshot',params:[]});
});
beforeEach(async()=>{await f.rpc.request({method:'evm_revert',params:[snapshot]});snapshot=await f.rpc.request({method:'evm_snapshot',params:[]});});
after(async()=>{f.provider.destroy();await f.rpc.disconnect();});
const reject=(operation,name)=>expectRevert(operation,name,w.interface);
async function propose(name,params,owner=0){const id=Number(await w.proposalCount());await sent(w.connect(s[owner]).proposeAction(ACTION_TYPES[name],encodeParams(name,params)));return id;}
async function governance(name,params,owner=0,approver=1){const id=await propose(name,params,owner);await sent(w.connect(s[approver]).approve(id));await f.mineAt((await w.getProposal(id)).readyAt);await sent(w.connect(s[owner]).execute(id));return id;}
async function recover(old=2,replacement=8){const id=Number(await w.recoveryCount());await sent(w.connect(s[3]).initiateRecovery(a[old],a[replacement]));return id;}
async function readyRecovery(id,replacement=8){await sent(w.connect(s[4]).approveRecovery(id));await sent(w.connect(s[replacement]).confirmRecovery(id));await f.mineAt((await w.getRecovery(id)).readyAt);}

test('colluding guardians cannot spend, approve payments, or grant themselves owner powers',async()=>{
  await sent(w.proposePayment(a[9],E('0.1')));
  for(const guardian of [3,4,5]){
    const actor=w.connect(s[guardian]);
    await reject(actor.proposePayment.staticCall(a[9],1n),'NotOwner');
    await reject(actor.approve.staticCall(0),'NotOwner');
    await reject(actor.execute.staticCall(0),'NotOwner');
    await reject(actor.proposeAction.staticCall(ACTION_TYPES.AddOwner,encodeParams('AddOwner',{owner:a[guardian]})),'NotOwner');
  }
  assert.equal(await w.liveApprovals(0),1n);assert.equal(await f.provider.getBalance(w.target),E('20'));
});

test('a compromised target can veto a fully approved recovery; remaining owners use governance',async()=>{
  const id=await recover();await readyRecovery(id);
  await sent(w.connect(s[2]).cancelRecovery(id));
  await reject(w.connect(s[8]).executeRecovery.staticCall(id),'WrongStatus');
  assert.equal(await w.isOwner(a[2]),true);assert.equal(await w.isOwner(a[8]),false);
  await governance('ReplaceOwner',{oldOwner:a[2],newOwner:a[8]});
  assert.equal(await w.isOwner(a[2]),false);assert.equal(await w.isOwner(a[8]),true);
  assert.equal(await f.provider.getBalance(w.target),E('20'));
});

test('lost guardian access blocks recovery until owner governance adds an accessible guardian',async()=>{
  const limited=await f.deploy('Treasury',[{...f.config,guardians:[a[3],a[4]],guardianThreshold:2,
    delays:{...f.config.delays,proposalTTL:1000,recoveryTTL:1000}}]);
  await sent(limited.connect(s[3]).initiateRecovery(a[2],a[8]));
  await sent(limited.connect(s[8]).confirmRecovery(0));await f.advance(60);
  await expectRevert(limited.connect(s[3]).executeRecovery.staticCall(0),'WrongStatus',limited.interface);
  assert.equal(await limited.liveRecoveryApprovals(0),1n);
  await sent(limited.proposeAction(ACTION_TYPES.AddGuardian,encodeParams('AddGuardian',{guardian:a[6]})));
  await sent(limited.connect(s[1]).approve(0));await f.mineAt((await limited.getProposal(0)).readyAt);await sent(limited.execute(0));
  await sent(limited.connect(s[6]).approveRecovery(0));await f.mineAt((await limited.getRecovery(0)).readyAt);
  await sent(limited.connect(s[6]).executeRecovery(0));assert.equal(await limited.isOwner(a[8]),true);
});

test('guardian recovery restores owner quorum without signatures from lost owner accounts',async()=>{
  // Only owner 0 remains accessible. Owners 1 and 2 never sign this scenario.
  const pending=await propose('AddGuardian',{guardian:a[6]});
  await reject(w.execute.staticCall(pending),'WrongStatus');
  const id=await recover();await readyRecovery(id);await sent(w.connect(s[3]).executeRecovery(id));
  await sent(w.connect(s[8]).approve(pending));await f.mineAt((await w.getProposal(pending)).readyAt);
  await sent(w.execute(pending));assert.equal(await w.isGuardian(a[6]),true);
  assert.equal(await w.isOwner(a[8]),true);assert.equal(await f.provider.getBalance(w.target),E('20'));
});

test('queued governance revalidates role overlap after a competing governance change',async()=>{
  const stale=await propose('AddOwner',{owner:a[6]});await sent(w.connect(s[1]).approve(stale));
  await governance('AddGuardian',{guardian:a[6]});
  await reject(w.execute.staticCall(stale),'RoleOverlap');
  assert.equal((await w.getProposal(stale)).status,1n);assert.equal(await w.isOwner(a[6]),false);
  assert.equal(await w.isGuardian(a[6]),true);assert.equal(await f.provider.getBalance(w.target),E('20'));
});

test('recovery replacement membership conflict blocks execution and can be resolved without restarting its timer',async()=>{
  const id=await recover();await readyRecovery(id);const originalReady=(await w.getRecovery(id)).readyAt;
  await governance('AddGuardian',{guardian:a[8]});
  await reject(w.connect(s[3]).executeRecovery.staticCall(id),'DuplicateAddress');
  assert.equal((await w.getRecovery(id)).status,1n);assert.equal(await w.isOwner(a[2]),true);
  await governance('RemoveGuardian',{guardian:a[8]});
  assert.equal((await w.getRecovery(id)).readyAt,originalReady);
  await sent(w.connect(s[3]).executeRecovery(id));assert.equal(await w.isOwner(a[8]),true);
  assert.equal(await f.provider.getBalance(w.target),E('20'));
});

test('competing queued payments cannot jointly exceed the daily cap',async()=>{
  const before=await f.provider.getBalance(a[9]);
  for(let id=0;id<3;id++){await sent(w.proposePayment(a[9],E('2')));await sent(w.connect(s[1]).approve(id));}
  await f.mineAt((await w.getProposal(2)).readyAt);
  await sent(w.execute(0));await sent(w.connect(s[1]).execute(1));
  await reject(w.connect(s[2]).execute.staticCall(2),'DailyCapExceeded');
  assert.equal(await w.spentToday(),E('4'));assert.equal(await f.provider.getBalance(a[9])-before,E('4'));
  assert.equal(await f.provider.getBalance(w.target),E('16'));assert.equal((await w.getProposal(2)).status,1n);
});

test('removed and readded owner recovery-veto votes do not revive',async()=>{
  const id=await recover();await sent(w.voteCancelRecovery(id));assert.equal(await w.recoveryCancelVotes(id),1n);
  await governance('ReplaceOwner',{oldOwner:a[0],newOwner:a[6]});
  assert.equal(await w.recoveryCancelVotes(id),0n);
  await governance('AddOwner',{owner:a[0]},1,6);
  assert.equal(await w.recoveryCancelVotes(id),0n);assert.equal(await w.hasVotedCancelRecovery(id,a[0]),false);
  await sent(w.voteCancelRecovery(id));await sent(w.connect(s[1]).voteCancelRecovery(id));
  assert.equal((await w.getRecovery(id)).status,3n);
});

test('queued payment preserves its original delay when governance changes delays and spending tiers',async()=>{
  await sent(w.proposePayment(a[9],E('0.1')));await sent(w.connect(s[1]).approve(0));
  const readyAt=(await w.getProposal(0)).readyAt;
  await governance('SetDelays',{...f.config.delays,smallTierDelay:10,largeTierDelay:50,proposalTTL:1000,recoveryTTL:1000});
  await governance('SetLimits',{...f.config.limits,smallTierCap:E('0.01')});
  assert.equal((await w.getProposal(0)).readyAt,readyAt);
  await sent(w.execute(0));assert.equal((await w.getProposal(0)).status,2n);
});
