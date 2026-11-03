import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseEther} from 'ethers';
import {setup,artifact} from './helpers/fixture.mjs';
import {assertRuntimeMatches,runPublicJourney,stringify} from '../scripts/lib/public-checks.mjs';

test('deployed runtime comparison masks only declared immutable slots',()=>{
 const compiled={deployedBytecode:'0x0000aabb',immutableReferences:{slot:[{start:0,length:2}]}};
 assert.ok(assertRuntimeMatches('0x1234aabb',compiled).runtimeCodeHash);
 assert.throws(()=>assertRuntimeMatches('0x1234aabc',compiled),/does not match/);
 assert.throws(()=>assertRuntimeMatches('0x',compiled),/No deployed contract/);
});

test('public journey rejects wrong networks and insufficient spending budgets before writes',async()=>{
 const f=await setup();try{
  const before=await f.provider.getBalance(f.accounts[0]);
  await assert.rejects(runPublicJourney({provider:f.provider,deployer:f.signers[0],artifacts:{}}),/Wrong network/);
  await assert.rejects(runPublicJourney({provider:f.provider,deployer:f.signers[0],artifacts:{},mode:'local-rehearsal',budgetWei:0n}),/run estimate/);
  assert.equal(await f.provider.getBalance(f.accounts[0]),before);
 }finally{f.provider.destroy();await f.rpc.disconnect();}
});

test('same deployment acceptance journey rehearses real multi-signer transactions locally', {timeout:240000},async()=>{
 const f=await setup();try{
  let updates=0;
  const {report,verifyTargets}=await runPublicJourney({provider:f.provider,deployer:f.signers[0],
   artifacts:{Treasury:artifact('Treasury'),TreasuryFactory:artifact('TreasuryFactory')},
   mode:'local-rehearsal',confirmations:1,waitForTime:f.mineAt,onProgress:()=>{updates++;}});
  assert.equal(report.mode,'local-rehearsal');assert.equal(report.chainId,1337);
  assert.equal(report.status,'functional-checks-passed');assert.equal(report.sourceVerification.length,0);
  assert.equal(verifyTargets.length,3);assert.ok(verifyTargets[1].constructorArguments.length>64);
  assert.ok(report.transactions.length>=30);assert.ok(report.transactions.every(t=>t.status==='confirmed'&&t.blockHash&&BigInt(t.gasUsed)>0n));
  assert.equal(report.expected.balanceWei,parseEther('0.000002').toString());
  assert.equal(report.expected.proposals,4);assert.equal(report.expected.recoveries,4);
  assert.ok(report.checks.some(c=>c.name.includes('stale recovery')));assert.ok(updates>report.transactions.length);
  assert.ok(!stringify(report).includes('privateKey'));
  fs.mkdirSync('test-results/sepolia-rehearsal',{recursive:true});
  fs.writeFileSync('test-results/sepolia-rehearsal/transaction-evidence.json',stringify(report));
 }finally{f.provider.destroy();await f.rpc.disconnect();}
});
