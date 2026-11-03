import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {JsonRpcProvider, Wallet, parseEther, parseUnits} from 'ethers';
import solc from 'solc';
import {compile,root} from './compile.mjs';
import {runPublicJourney,stringify} from './lib/public-checks.mjs';
import {verifySource} from './lib/explorer.mjs';

if (fs.existsSync(path.join(root,'.env'))) process.loadEnvFile(path.join(root,'.env'));
const out = path.join(root,'test-results/sepolia');
fs.mkdirSync(out,{recursive:true});
const evidencePath = path.join(out,'evidence.json');
let report = {schemaVersion:1,mode:'public',chainId:11155111,status:'running',stage:'configuration',
  revision:process.env.GITHUB_SHA ?? 'local-uncommitted',runUrl:process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID ?
    `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null};
const save = () => fs.writeFileSync(evidencePath,stringify(report));
let provider;
try {
  for (const name of ['SEPOLIA_RPC_URL','DEPLOYER_KEY','ETHERSCAN_API_KEY']) if (!process.env[name]) throw Error(`Missing ${name}. Configure the sepolia GitHub environment.`);
  if (!process.env.SEPOLIA_BROWSER_RPC_URL) throw Error('Missing public SEPOLIA_BROWSER_RPC_URL variable for the frontend check.');
  const browserRpc = new URL(process.env.SEPOLIA_BROWSER_RPC_URL);
  if (browserRpc.protocol !== 'https:' || browserRpc.username || browserRpc.password) throw Error('Browser RPC must be an HTTPS endpoint explicitly suitable for public frontend use.');
  const rpc = new URL(process.env.SEPOLIA_RPC_URL);
  if (rpc.protocol !== 'https:' || ['localhost','127.0.0.1','::1'].includes(rpc.hostname)) throw Error('Public deployment requires an HTTPS Sepolia RPC.');
  provider = new JsonRpcProvider(rpc.href,undefined,{cacheTimeout:0,pollingInterval:4000});
  if (Number((await provider.getNetwork()).chainId) !== 11155111) throw Error('Wrong RPC network; Sepolia chain ID 11155111 is required.');
  const key = process.env.DEPLOYER_KEY.trim();
  if (!/^(0x)?[a-fA-F0-9]{64}$/.test(key)) throw Error('DEPLOYER_KEY must be a 32-byte test-account private key.');
  const deployer = new Wallet(key.startsWith('0x')?key:`0x${key}`,provider);
  const artifacts = compile();
  const input = JSON.parse(fs.readFileSync(path.join(root,'artifacts/standard-input.json')));
  report.compilerVersion = `v${solc.version().split('.Emscripten')[0]}`;
  report.sourceInputSha256 = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  save();
  const result = await runPublicJourney({provider,deployer,artifacts,report,
    confirmations:Number(process.env.SEPOLIA_CONFIRMATIONS ?? 2),
    budgetWei:parseEther(process.env.SEPOLIA_MAX_SPEND_ETH ?? '0.1'),
    feeCapWei:parseUnits(process.env.SEPOLIA_MAX_FEE_GWEI ?? '10','gwei'),onProgress:save});
  report = result.report;
  // Preserve creation arguments before governance/recovery changes current membership.
  fs.writeFileSync(path.join(out,'verification-input.json'),stringify({compilerVersion:report.compilerVersion,targets:result.verifyTargets}));
  const manifest = {chainId:11155111,factory:report.factory.address,factoryDeployedAtBlock:report.factory.blockNumber,
    demoWallet:report.wallets.primary.address,secondaryWallet:report.wallets.secondary.address,
    rpcUrlEnv:'VITE_RPC_URL',revision:report.revision,automatedTestFixture:true,
    warning:'Disposable automated proof wallets. Do not send real funds or use as a team treasury.'};
  fs.writeFileSync(path.join(out,'deployment.json'),stringify(manifest));
  report.stage = 'explorer source verification'; save();
  for (const target of result.verifyTargets) {
    const verified = await verifySource({...target,input,compilerVersion:report.compilerVersion,apiKey:process.env.ETHERSCAN_API_KEY});
    report.sourceVerification.push(verified); save();
  }
  report.status = 'contract-and-source-checks-passed';report.stage = 'awaiting production frontend check';
  report.contractChecksCompletedAt = new Date().toISOString();save();
  console.log(`Sepolia contract and source checks passed. Factory ${manifest.factory}; treasury ${manifest.demoWallet}.`);
  console.log('Run the production frontend check to complete the CI acceptance result.');
} catch(error) {
  report.status = 'failed';
  let message = error.shortMessage ?? error.message ?? 'Public testnet check failed.';
  for (const name of ['SEPOLIA_RPC_URL','DEPLOYER_KEY','ETHERSCAN_API_KEY']) if (process.env[name]) message = message.replaceAll(process.env[name],'[redacted]');
  report.error = message.slice(0,700);save();console.error(report.error);process.exitCode = 1;
} finally { provider?.destroy(); }
