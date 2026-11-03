// Explain valid but risky configurations without changing the wallet's trust model.
export function configurationWarnings(config) {
  const warnings=[];
  if(Number(config.threshold)===1) warnings.push('One owner can authorize payments and governance changes. This setting does not require agreement from another owner.');
  if(config.owners.length&&Number(config.threshold)===config.owners.length) warnings.push('Other owners cannot reach the recovery cancellation threshold without the targeted owner. Only that address can cancel directly; a lost key cannot use that veto.');
  if(config.guardians.length&&Number(config.guardianThreshold)===config.guardians.length) warnings.push('Recovery requires every guardian. If one loses access, owners must change guardian settings while an owner quorum is still available.');
  return warnings;
}

export function canReachRecoveryVeto(config,target) {
  const eligible=config.owners.filter(a=>a.toLowerCase()!==target.toLowerCase()).length;
  return eligible>=Number(config.threshold);
}
