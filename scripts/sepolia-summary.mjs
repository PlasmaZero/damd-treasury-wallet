import fs from 'node:fs';
const file='test-results/sepolia/evidence.json';
const report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{status:'not-started',transactions:[],checks:[]};
const lines=['## Sepolia deployment and acceptance',`Result: **${report.status}**`,
  `Revision: ${report.revision??process.env.GITHUB_SHA??'unknown'}`,
  `Functional assertions: ${report.checks?.length??0}`,
  `Explorer verified contracts: ${report.sourceVerification?.length??0}`,
  `Production UI: ${report.frontend?.status??'not run'}`,'',
  ...(report.transactions??[]).map(t=>`- ${t.name}: ${t.explorerUrl?`[${t.txHash}](${t.explorerUrl})`:t.txHash} (${t.status})`),
  '', 'A green local rehearsal is not public-testnet evidence. Download the evidence artifact for the full result.'];
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
else console.log(lines.join('\n'));
