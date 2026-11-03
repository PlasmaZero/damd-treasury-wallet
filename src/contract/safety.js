// Explain valid but risky configurations without changing the wallet's trust model.
export function configurationWarnings(config) {
  const warnings=[];
  if(Number(config.threshold)===1) warnings.push('One owner can authorize payments and governance changes. This setting does not require agreement from another owner.');
  if(Number(config.guardianThreshold)===1) warnings.push('One guardian can authorize a recovery request. The recovery delay, replacement confirmation and owner cancellation rules still apply.');
  if(config.owners.length&&Number(config.threshold)===config.owners.length) warnings.push('Other owners cannot reach the recovery cancellation threshold without the targeted owner. Only that address can cancel directly; a lost key cannot use that veto.');
  if(config.guardians.length&&Number(config.guardianThreshold)===config.guardians.length) warnings.push('Recovery requires every guardian. If one loses access, owners must change guardian settings while an owner quorum is still available.');
  return warnings;
}

// Preview the membership being proposed so removals cannot hide quorum warnings.
// Submission validation and the contract remain authoritative for invalid inputs.
export function previewGovernanceConfig(config,action,values={}) {
  const next={...config,owners:[...config.owners],guardians:[...config.guardians]};
  const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
  const address=value=>/^0x[0-9a-fA-F]{40}$/.test(value??'');
  if(action==='SetThreshold'&&/^\d+$/.test(values.threshold??''))next.threshold=Number(values.threshold);
  if(action==='SetGuardianThreshold'&&/^\d+$/.test(values.guardianThreshold??''))next.guardianThreshold=Number(values.guardianThreshold);
  if(action==='AddOwner'&&address(values.owner)&&!next.owners.some(a=>same(a,values.owner)))next.owners.push(values.owner);
  if(action==='RemoveOwner'&&address(values.owner))next.owners=next.owners.filter(a=>!same(a,values.owner));
  if(action==='ReplaceOwner'&&address(values.oldOwner)&&address(values.newOwner))next.owners=next.owners.map(a=>same(a,values.oldOwner)?values.newOwner:a);
  if(action==='AddGuardian'&&address(values.guardian)&&!next.guardians.some(a=>same(a,values.guardian)))next.guardians.push(values.guardian);
  if(action==='RemoveGuardian'&&address(values.guardian))next.guardians=next.guardians.filter(a=>!same(a,values.guardian));
  return next;
}

export function canReachRecoveryVeto(config,target) {
  const eligible=config.owners.filter(a=>a.toLowerCase()!==target.toLowerCase()).length;
  return eligible>=Number(config.threshold);
}
