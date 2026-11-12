import {ACTION_NAMES,FIELDS,parseAddresses,parseSingleAddress,parseWholeNumber,parseAmount,validateConfig} from './params.js';
import {previewGovernanceConfig} from './safety.js';

const name=k=>k.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
const has=(list,address)=>list.some(a=>a.toLowerCase()===address.toLowerCase());
function collector() {
  const errors={};
  const read=(field,fn)=>{try{return fn();}catch(e){errors[field]=e.message;return undefined;}};
  return {errors,read};
}
function threshold(value,count,label,field,{errors,read}) {
  const n=read(field,()=>parseWholeNumber(value,label,{min:1}));
  if(n===undefined&&count!==undefined)errors[field]=`${label} must be a whole number from 1 to ${count}.`;
  if(n!==undefined&&count!==undefined&&n>count)
    errors[field]=`${label} cannot exceed the number of ${field==='threshold'?'owners':'guardians'} (${count}).`;
  return n;
}

// The same parsed result drives field errors, the disabled review button and submission.
export function walletFormState(values) {
  const state=collector(),{errors,read}=state;
  const members=field=>read(field,()=>{
    let list;try{list=parseAddresses(values[field]??'');}catch{throw Error(`Enter valid Ethereum addresses for ${field}.`);}
    if(list.length<1||list.length>20)throw Error(`Use 1-20 ${field}; ${list.length} entered.`);
    return list;
  });
  const owners=members('owners'),guardians=members('guardians');
  const config={owners,guardians,
    threshold:threshold(values.threshold,owners?.length,'Owner threshold','threshold',state),
    guardianThreshold:threshold(values.guardianThreshold,guardians?.length,'Guardian threshold','guardianThreshold',state),
    limits:Object.fromEntries(FIELDS.SetLimits.map(k=>[k,read(k,()=>parseAmount(values[k]))])),
    delays:Object.fromEntries(FIELDS.SetDelays.map(k=>[k,read(k,()=>parseWholeNumber(values[k],name(k)))]))};
  if(!Object.keys(errors).length)read('config',()=>validateConfig(config));
  return {errors,valid:!Object.keys(errors).length,config};
}

export function governanceFormState(config,action,values,walletAddress) {
  const state=collector(),{errors,read}=state,params={};
  if(!ACTION_NAMES.includes(action)||action==='Payment')return {valid:false,errors:{action:'Choose a governance action.'}};
  for(const k of FIELDS[action]) {
    if(FIELDS.SetLimits.includes(k))params[k]=read(k,()=>parseAmount(values[k]));
    else if(/owner|guardian/i.test(k)&&!k.includes('Threshold'))
      params[k]=read(k,()=>parseSingleAddress(values[k],name(k)));
    else if(k==='threshold'||k==='guardianThreshold') {
      const count=k==='threshold'?config.owners.length:config.guardians.length;
      const n=threshold(values[k],count,k==='threshold'?'Owner threshold':'Guardian threshold',k,state);
      if(n!==undefined)params[k]=BigInt(n);
    } else {
      const n=read(k,()=>parseWholeNumber(values[k],name(k)));
      if(n!==undefined)params[k]=BigInt(n);
    }
  }
  if(!Object.keys(errors).length) {
    const fresh=field=>{
      const address=params[field];
      if(has(config.owners,address)||has(config.guardians,address))errors[field]='This address is already an owner or guardian. Use a different address.';
      else if(walletAddress&&address.toLowerCase()===walletAddress.toLowerCase())errors[field]='A treasury cannot be its own owner or guardian.';
    };
    if(action==='AddOwner')fresh('owner');
    if(action==='AddGuardian')fresh('guardian');
    if(action==='ReplaceOwner') {
      if(!has(config.owners,params.oldOwner))errors.oldOwner='Choose a current owner to replace.';
      fresh('newOwner');
    }
    if(action==='RemoveOwner'||action==='RemoveGuardian') {
      const owner=action==='RemoveOwner',field=owner?'owner':'guardian',members=owner?config.owners:config.guardians,n=owner?config.threshold:config.guardianThreshold;
      if(!has(members,params[field]))errors[field]=`Choose a current ${field} to remove.`;
      else if(members.length===1)errors[field]=`Cannot remove the last ${field}. At least one ${field} must remain.`;
      else if(members.length-1<n)errors[field]=`Cannot remove this ${field}: ${members.length-1} remaining ${field}s would be below the threshold (${n}). Lower the threshold first.`;
    }
    if(!Object.keys(errors).length) {
      const next=previewGovernanceConfig(config,action,params);
      if(action==='SetLimits')next.limits=params;
      if(action==='SetDelays')next.delays=Object.fromEntries(Object.entries(params).map(([k,v])=>[k,Number(v)]));
      read('config',()=>validateConfig(next));
    }
  }
  return {errors,valid:!Object.keys(errors).length,params};
}
