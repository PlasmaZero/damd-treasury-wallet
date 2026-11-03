import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configurationWarnings,canReachRecoveryVeto} from '../src/contract/safety.js';

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
