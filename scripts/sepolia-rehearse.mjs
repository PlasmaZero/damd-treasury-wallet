// Rehearsal only: isolated chain and app copy. Never writes the real deployment manifests.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JsonRpcProvider} from 'ethers';
import ganache from 'ganache';
import {compile,root} from './compile.mjs';
import {runPublicJourney,stringify} from './lib/public-checks.mjs';
import {verifyFrontend} from './lib/public-ui.mjs';
import {buildFixtureApp} from './lib/ci-app.mjs';

const directory=path.join(root,'test-results/sepolia-rehearsal');fs.mkdirSync(directory,{recursive:true});
const records=['deployments/11155111.json','public/deployments/11155111.json','deployments/1337.json','public/deployments/1337.json'];
const originals=records.map(file=>fs.readFileSync(path.join(root,file)));
const server=ganache.server({wallet:{deterministic:true,totalAccounts:2,defaultBalance:1000},
 chain:{chainId:1337,hardfork:'merge'},miner:{blockTime:1},logging:{quiet:true}});
let provider;
try {
 await server.listen(18545,'127.0.0.1');
 const rpcUrl='http://127.0.0.1:18545';provider=new JsonRpcProvider(rpcUrl,undefined,{cacheTimeout:0,pollingInterval:100});
 const artifacts=compile();
 const {report}=await runPublicJourney({provider,deployer:await provider.getSigner(0),artifacts,mode:'local-rehearsal',confirmations:1,
  waitForTime:async target=>{await server.provider.request({method:'evm_mine',params:[target]});},
  onProgress:r=>fs.writeFileSync(path.join(directory,'evidence.json'),stringify(r))});
 const appDir=await buildFixtureApp({directory,chainId:1337,rpcUrl,manifest:{chainId:1337,factory:report.factory.address,
  factoryDeployedAtBlock:report.factory.blockNumber,demoWallet:report.wallets.primary.address}});
 await verifyFrontend({report,directory,rpcUrl,mode:'local-rehearsal',appDir});
 assert.equal(report.status,'local-rehearsal-passed');assert.equal(report.sourceVerification.length,0);
 records.forEach((file,index)=>assert.deepEqual(fs.readFileSync(path.join(root,file)),originals[index],`Changed team deployment record: ${file}`));
 console.log('Full local deployment/functional/frontend rehearsal passed. Public source verification remains an external check.');
} catch(error) {console.error(error.shortMessage??error.message);process.exitCode=1;}
finally {provider?.destroy();await server.close();}
