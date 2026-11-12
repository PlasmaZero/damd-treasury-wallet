import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatEther,MaxUint256,ZeroAddress} from 'ethers';
import {walletFormState,governanceFormState} from '../src/contract/formValidation.js';
import {parseSingleAddress,parseWholeNumber,parseAmount,validateConfig} from '../src/contract/params.js';

const address=i=>`0x${i.toString(16).padStart(40,'0')}`;
const values=(owners=3,guardians=3)=>({owners:Array.from({length:owners},(_,i)=>address(i+1)).join(', '),guardians:Array.from({length:guardians},(_,i)=>address(i+101)).join('\n'),threshold:'1',guardianThreshold:'1',perTxCap:'2',dailyCap:'5',smallTierCap:'0.5',smallTierDelay:'0',largeTierDelay:'30',governanceDelay:'60',recoveryDelay:'60',proposalTTL:'61',recoveryTTL:'61'});
const config=()=>walletFormState({...values(),threshold:'2',guardianThreshold:'2'}).config;

test('creation and governance enforce both threshold ranges for every supported member count',()=>{
  for(const group of ['owners','guardians'])for(let count=1;count<=20;count++) {
    const raw=group==='owners'?values(count,3):values(3,count);
    const field=group==='owners'?'threshold':'guardianThreshold',action=group==='owners'?'SetThreshold':'SetGuardianThreshold';
    const c=walletFormState(raw).config;
    for(let n=0;n<=21;n++) {
      const expected=n>=1&&n<=count;
      assert.equal(walletFormState({...raw,[field]:String(n)}).valid,expected,`creation ${group}=${count}, threshold=${n}`);
      assert.equal(governanceFormState(c,action,{[field]:String(n)}).valid,expected,`governance ${group}=${count}, threshold=${n}`);
    }
  }
});

test('threshold fields reject empty, negative, fractional, scientific, hex and unsafe numeric input',()=>{
  for(const input of ['',' ','0','-1','1.5','1e0','0x2','NaN','Infinity','9007199254740993'])for(const field of ['threshold','guardianThreshold']) {
    assert.equal(walletFormState({...values(),[field]:input}).valid,false);
    assert.equal(governanceFormState(config(),field==='threshold'?'SetThreshold':'SetGuardianThreshold',{[field]:input}).valid,false);
  }
  assert.equal(walletFormState({...values(),threshold:' 2 ',guardianThreshold:'02'}).valid,true);
  assert.equal(parseWholeNumber('0','Delay'),0);
  assert.throws(()=>parseWholeNumber('','Delay'),/whole number/);
});

test('wallet creation rejects missing, excessive, duplicate, overlapping and invalid members',()=>{
  for(const raw of [values(0),values(21),values(3,0),values(3,21),{...values(),owners:`${address(1)},${address(1)}`},{...values(),guardians:address(1)},{...values(),owners:ZeroAddress},{...values(),guardians:'0x1234'}])
    assert.equal(walletFormState(raw).valid,false);
  assert.equal(walletFormState(values(20,20)).valid,true);
});

test('governance prevents removal below quorum and rejects absent or conflicting members',()=>{
  const c={...config(),threshold:3,guardianThreshold:3},before=structuredClone(c);
  for(const [action,field,list]of [['RemoveOwner','owner',c.owners],['RemoveGuardian','guardian',c.guardians]]) {
    const blocked=governanceFormState(c,action,{[field]:list[0]});
    assert.equal(blocked.valid,false);assert.match(blocked.errors[field],/Lower the threshold first/);
    assert.equal(governanceFormState({...c,threshold:2,guardianThreshold:2},action,{[field]:list[0]}).valid,true);
    assert.equal(governanceFormState(c,action,{[field]:address(999)}).valid,false);
  }
  for(const newOwner of [c.owners[0],c.guardians[0],ZeroAddress,address(999)])
    assert.equal(governanceFormState(c,'ReplaceOwner',{oldOwner:c.owners[0],newOwner},address(999)).valid,false);
  assert.equal(governanceFormState(c,'ReplaceOwner',{oldOwner:address(999),newOwner:address(998)}).valid,false);
  assert.equal(governanceFormState(c,'ReplaceOwner',{oldOwner:c.owners[0],newOwner:address(998)}).valid,true);
  assert.equal(governanceFormState(c,'AddOwner',{owner:c.guardians[0]}).valid,false);
  assert.equal(governanceFormState(c,'AddGuardian',{guardian:c.owners[0]}).valid,false);
  const full=walletFormState(values(20,20)).config;
  assert.equal(governanceFormState(full,'AddOwner',{owner:address(999)}).valid,false);
  assert.equal(governanceFormState(full,'AddGuardian',{guardian:address(999)}).valid,false);
  const single=walletFormState(values(1,1)).config;
  for(const [action,field,member]of [['RemoveOwner','owner',single.owners[0]],['RemoveGuardian','guardian',single.guardians[0]]]) {
    const result=governanceFormState(single,action,{[field]:member});
    assert.equal(result.valid,false);assert.match(result.errors[field],/Cannot remove the last/);
  }
  assert.deepEqual(c,before);
});

test('a membership refresh immediately invalidates a now excessive proposed threshold',()=>{
  const c=config();
  for(const [action,field,group]of [['SetThreshold','threshold','owners'],['SetGuardianThreshold','guardianThreshold','guardians']]) {
    assert.equal(governanceFormState(c,action,{[field]:'3'}).valid,true);
    const result=governanceFormState({...c,[group]:c[group].slice(0,2)},action,{[field]:'3'});
    assert.equal(result.valid,false);assert.match(result.errors[field],/cannot exceed/);
  }
});

test('ETH caps enforce positive uint256 amounts, decimal precision and cap ordering',()=>{
  assert.equal(parseAmount('0.000000000000000001'),1n);
  assert.equal(parseAmount(formatEther(MaxUint256)),MaxUint256);
  for(const n of ['0','-1','0.0000000000000000001','1e3',formatEther(MaxUint256+1n)])assert.throws(()=>parseAmount(n));
  for(const limits of [{smallTierCap:'0',perTxCap:'1',dailyCap:'2'},{smallTierCap:'2',perTxCap:'1',dailyCap:'3'},{smallTierCap:'1',perTxCap:'3',dailyCap:'2'}]) {
    assert.equal(walletFormState({...values(),...limits}).valid,false);
    assert.equal(governanceFormState(config(),'SetLimits',limits).valid,false);
  }
  assert.equal(governanceFormState(config(),'SetLimits',{smallTierCap:'1',perTxCap:'1',dailyCap:'1'}).valid,true);
});

test('delays enforce required whole seconds, minimums, ordering and strict expiry boundaries',()=>{
  const raw=values(),c=config();
  const invalid=[{governanceDelay:'59'},{recoveryDelay:'59'},{smallTierDelay:'31'},{largeTierDelay:'61'},{governanceDelay:'61'},{proposalTTL:'60'},{recoveryTTL:'60'},{smallTierDelay:''},{largeTierDelay:'0.5'},{recoveryTTL:'18446744073709551616'}];
  for(const change of invalid) {
    assert.equal(walletFormState({...raw,...change}).valid,false,JSON.stringify(change));
    assert.equal(governanceFormState(c,'SetDelays',{...raw,...change}).valid,false,JSON.stringify(change));
  }
  assert.equal(walletFormState(raw).valid,true);
  assert.equal(governanceFormState(c,'SetDelays',raw).valid,true);
  const incomplete=structuredClone(c);delete incomplete.delays.proposalTTL;
  assert.throws(()=>validateConfig(incomplete),/whole seconds/);
});

test('single-address inputs reject ambiguous recipients, zero and malformed addresses',()=>{
  assert.equal(parseSingleAddress(` ${address(1)} `),address(1));
  for(const value of ['',ZeroAddress,'0x1234',`${address(1)},${address(2)}`,`${address(1)}\n${address(2)}`])assert.throws(()=>parseSingleAddress(value));
});
