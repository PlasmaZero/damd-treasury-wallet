import { AbiCoder, formatEther, getAddress, parseEther } from 'ethers';
export const ACTION_NAMES=['Payment','AddOwner','RemoveOwner','ReplaceOwner','SetThreshold','AddGuardian','RemoveGuardian','SetGuardianThreshold','SetLimits','SetDelays'];
export const ACTION_TYPES=Object.fromEntries(ACTION_NAMES.flatMap((n,i)=>[[n,i],[i,n]]));
export const STATUS=['Pending','Queued','Executed','Cancelled','Expired'];
export const FIELDS={Payment:['recipient','amount'],AddOwner:['owner'],RemoveOwner:['owner'],ReplaceOwner:['oldOwner','newOwner'],SetThreshold:['threshold'],AddGuardian:['guardian'],RemoveGuardian:['guardian'],SetGuardianThreshold:['guardianThreshold'],SetLimits:['perTxCap','dailyCap','smallTierCap'],SetDelays:['smallTierDelay','largeTierDelay','governanceDelay','recoveryDelay','proposalTTL','recoveryTTL']};
const types={Payment:['address','uint256'],AddOwner:['address'],RemoveOwner:['address'],ReplaceOwner:['address','address'],SetThreshold:['uint256'],AddGuardian:['address'],RemoveGuardian:['address'],SetGuardianThreshold:['uint256'],SetLimits:['uint256','uint256','uint256'],SetDelays:Array(6).fill('uint64')};
export const actionName=a=>typeof a==='string'&&FIELDS[a]?a:ACTION_NAMES[Number(a)];
export function encodeParams(a,obj) { const name=actionName(a); if(!name) throw Error('Unknown action'); return AbiCoder.defaultAbiCoder().encode(types[name],FIELDS[name].map(k=>obj[k])); }
export function decodeParams(a,hex) { const name=actionName(a); const values=AbiCoder.defaultAbiCoder().decode(types[name],hex); return Object.fromEntries(FIELDS[name].map((k,i)=>[k,values[i]])); }
export function short(a) { return a?`${a.slice(0,6)}…${a.slice(-4)}`:'—'; }
export function describeAction(a,p) {
  const name=actionName(a);
  if(name==='Payment') return `Pay ${formatEther(p.amount)} ETH to ${short(p.recipient)}`;
  if(name==='ReplaceOwner') return `Replace ${short(p.oldOwner)} with ${short(p.newOwner)}`;
  if(name==='SetLimits') return `Limits: ${formatEther(p.perTxCap)} ETH / payment, ${formatEther(p.dailyCap)} ETH / day`;
  if(name==='SetDelays') return 'Update payment, governance and recovery delays';
  return `${name.replace(/([a-z])([A-Z])/g,'$1 $2')}: ${Object.values(p).map(v=>typeof v==='string'&&v.startsWith('0x')?short(v):String(v)).join(', ')}`;
}
export const eth=v=>formatEther(v??0n);
export function parseAmount(s) { const n=parseEther(String(s).trim()); if(n<=0n) throw Error('Enter an ETH amount greater than zero.'); return n; }
export function parseAddresses(s) { return s.split(/[\s,;]+/).filter(Boolean).map(getAddress); }
export function validateConfig(c) {
  const all=[...c.owners,...c.guardians].map(a=>getAddress(a).toLowerCase());
  if(all.some(a=>/^0x0{40}$/.test(a))) throw Error('Members cannot use the zero address.');
  if(new Set(all).size!==all.length) throw Error('Owners and guardians must be unique and cannot overlap.');
  if(!c.owners.length||c.owners.length>20||!c.guardians.length||c.guardians.length>20) throw Error('Use 1–20 owners and 1–20 guardians.');
  if(!Number.isInteger(c.threshold)||c.threshold<1||c.threshold>c.owners.length||!Number.isInteger(c.guardianThreshold)||c.guardianThreshold<1||c.guardianThreshold>c.guardians.length) throw Error('Thresholds must be whole numbers within their group size.');
  const l=c.limits,d=c.delays;
  if(l.smallTierCap<=0n||l.smallTierCap>l.perTxCap||l.perTxCap>l.dailyCap) throw Error('Limits must satisfy 0 < small tier ≤ per-payment cap ≤ daily cap.');
  if(Object.values(d).some(n=>!Number.isSafeInteger(n)||n<0)||d.governanceDelay<60||d.recoveryDelay<60||d.smallTierDelay>d.largeTierDelay||d.largeTierDelay>d.governanceDelay||d.governanceDelay>d.recoveryDelay||d.proposalTTL<=d.governanceDelay||d.recoveryTTL<=d.recoveryDelay) throw Error('Use whole seconds: small ≤ large ≤ governance ≤ recovery; governance ≥ 60; each expiry must exceed its maximum delay.');
  return c;
}
