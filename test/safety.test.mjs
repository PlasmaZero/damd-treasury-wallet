import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configurationWarnings,canReachRecoveryVeto,previewGovernanceConfig} from '../src/contract/safety.js';

test('valid but risky configurations explain unilateral control and unavailable cancellation',()=>{
 const config={owners:['a','b','c'],threshold:2,guardians:['g','h','i'],guardianThreshold:2};
 assert.deepEqual(configurationWarnings(config),[]);
 assert.ok(configurationWarnings({...config,threshold:1}).some(s=>s.includes('One owner')));
 assert.ok(configurationWarnings({...config,threshold:3}).some(s=>s.includes('Only that address')));
 assert.ok(configurationWarnings({...config,guardianThreshold:3}).some(s=>s.includes('every guardian')));
 // A stale request whose target already left can be vetoed by all current owners.
 assert.equal(canReachRecoveryVeto({...config,threshold:3},'a'),false);
 assert.equal(canReachRecoveryVeto({...config,threshold:3},'removed'),true);
});

const address=i=>`0x${String(i).padStart(40,'0')}`;
const balanced=()=>({owners:[address(1),address(2),address(3)],threshold:2,guardians:[address(4),address(5),address(6)],guardianThreshold:2});

test('single-guardian warning preserves delay, confirmation and cancellation caveats',()=>{
  const warnings=configurationWarnings({...balanced(),guardianThreshold:1});
  const warning=warnings.find(s=>s.includes('One guardian'));
  assert.ok(warning);assert.match(warning,/delay/);assert.match(warning,/confirmation/);assert.match(warning,/cancellation/);
});

test('owner removal previews the newly unreachable other-owner recovery veto',()=>{
  const config=balanced(),original=structuredClone(config);
  const preview=previewGovernanceConfig(config,'RemoveOwner',{owner:config.owners[2]});
  assert.equal(preview.owners.length,2);assert.equal(preview.threshold,2);
  assert.ok(configurationWarnings(preview).some(s=>s.includes('Only that address')));
  assert.deepEqual(config,original);assert.equal(canReachRecoveryVeto(preview,preview.owners[0]),false);
});

test('guardian removal warns that every remaining guardian must be accessible',()=>{
  const config=balanced();
  const preview=previewGovernanceConfig(config,'RemoveGuardian',{guardian:config.guardians[2]});
  assert.equal(preview.guardians.length,2);
  assert.ok(configurationWarnings(preview).some(s=>s.includes('every guardian')));
  const restored=previewGovernanceConfig(preview,'AddGuardian',{guardian:address(7)});
  assert.ok(!configurationWarnings(restored).some(s=>s.includes('every guardian')));
  assert.equal(config.guardians.length,3);
});

test('governance previews preserve threshold warnings and ignore partial address inputs',()=>{
  const config=balanced();
  assert.ok(configurationWarnings(previewGovernanceConfig(config,'SetThreshold',{threshold:'1'})).some(s=>s.includes('One owner')));
  assert.ok(configurationWarnings(previewGovernanceConfig(config,'SetGuardianThreshold',{guardianThreshold:'1'})).some(s=>s.includes('One guardian')));
  assert.deepEqual(previewGovernanceConfig(config,'RemoveOwner',{owner:'0x12'}),config);
  assert.equal(previewGovernanceConfig(config,'AddOwner',{owner:config.owners[0]}).owners.length,3);
  assert.deepEqual(previewGovernanceConfig(config,'ReplaceOwner',{oldOwner:config.owners[0],newOwner:address(8)}).owners,[address(8),config.owners[1],config.owners[2]]);
});
