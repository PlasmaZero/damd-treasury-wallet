import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {MaxUint256} from 'ethers';
import {setup,sent,expectRevert} from './helpers/fixture.mjs';
import {ACTION_TYPES,encodeParams} from '../src/contract/params.js';

let f,factory;
before(async()=>{f=await setup();factory=await f.deploy('TreasuryFactory');});
after(async()=>{f.provider.destroy();await f.rpc.disconnect();});
const address=i=>`0x${i.toString(16).padStart(40,'0')}`;

test('factory rejects zero and excessive thresholds for both groups, including 1 and 20 member boundaries',async()=>{
  for(const count of [1,3,20]) {
    const config={...f.config,owners:Array.from({length:count},(_,i)=>address(i+1)),guardians:Array.from({length:count},(_,i)=>address(i+101)),threshold:1,guardianThreshold:1};
    for(const field of ['threshold','guardianThreshold']) {
      for(const n of [0,count+1,MaxUint256])
        await expectRevert(factory.createWallet.staticCall({...config,[field]:n}),'InvalidThreshold',f.wallet.interface);
      for(const n of [1,count])assert.match(await factory.createWallet.staticCall({...config,[field]:n}),/^0x[0-9a-fA-F]{40}$/);
    }
  }
  for(const group of ['owners','guardians']) {
    const members=Array.from({length:21},(_,i)=>address(i+(group==='owners'?1:101)));
    // Keep the other group disjoint from this synthetic address list.
    const config={...f.config,owners:[address(51)],guardians:[address(151)],threshold:1,guardianThreshold:1,[group]:members};
    await expectRevert(factory.createWallet.staticCall(config),'TooManyMembers',f.wallet.interface);
  }
});

test('queued threshold increases are revalidated if owner or guardian membership shrinks first',async()=>{
  const wallet=f.wallet;
  const propose=async(action,params)=>{
    const id=Number(await wallet.proposalCount());
    await sent(wallet.proposeAction(ACTION_TYPES[action],encodeParams(action,params)));
    await sent(wallet.connect(f.signers[1]).approve(id));
    return id;
  };
  for(const [action,field,removal,member,addressField]of [
    ['SetThreshold','threshold','RemoveOwner',f.accounts[2],'owner'],
    ['SetGuardianThreshold','guardianThreshold','RemoveGuardian',f.accounts[5],'guardian']
  ]) {
    const increase=await propose(action,{[field]:3});
    const remove=await propose(removal,{[addressField]:member});
    await f.mineAt((await wallet.getProposal(remove)).readyAt);await sent(wallet.execute(remove));
    await expectRevert(wallet.execute.staticCall(increase),'InvalidThreshold',wallet.interface);
    assert.equal((await wallet.getProposal(increase)).status,1n);
    const config=await wallet.getConfig();
    assert.equal(Number(config[field]),2);assert.equal(config[field==='threshold'?'owners':'guardians'].length,2);
    await expectRevert(wallet.proposeAction.staticCall(ACTION_TYPES[action],encodeParams(action,{[field]:0})),'InvalidThreshold',wallet.interface);
    await expectRevert(wallet.proposeAction.staticCall(ACTION_TYPES[removal],encodeParams(removal,{[addressField]:config[field==='threshold'?'owners':'guardians'][0]})),'InvalidThreshold',wallet.interface);
  }
});
