// Rehearsal only: isolated chain and app copy. Never writes the real deployment manifests.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {JsonRpcProvider} from 'ethers';
import ganache from 'ganache';
import {compile,root} from './compile.mjs';
import {runPublicJourney,stringify} from './lib/public-checks.mjs';
import {verifyFrontend} from './lib/public-ui.mjs';

const directory=path.join(root,'test-results/sepolia-rehearsal');fs.mkdirSync(directory,{recursive:true});
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
 const appDir=path.join(directory,'app');fs.mkdirSync(appDir,{recursive:true});
 for(const item of ['src','index.html','vite.config.js'])fs.cpSync(path.join(root,item),path.join(appDir,item),{recursive:true});
 fs.writeFileSync(path.join(appDir,'package.json'),'{"type":"module"}\n');
 const publicDir=path.join(appDir,'public/deployments');fs.mkdirSync(publicDir,{recursive:true});
 fs.writeFileSync(path.join(publicDir,'1337.json'),stringify({chainId:1337,factory:report.factory.address,
  factoryDeployedAtBlock:report.factory.blockNumber,demoWallet:report.wallets.primary.address}));
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build'],
   {cwd:appDir,stdio:'inherit',env:{...process.env,VITE_USE_MOCK:'false',VITE_CHAIN_ID:'1337',VITE_RPC_URL:rpcUrl}});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Rehearsal frontend build failed ${code}.`)));
 });
 await verifyFrontend({report,directory,rpcUrl,mode:'local-rehearsal',appDir});
 assert.equal(report.status,'local-rehearsal-passed');assert.equal(report.sourceVerification.length,0);
 console.log('Full local deployment/functional/frontend rehearsal passed. Public source verification remains an external check.');
} catch(error) {console.error(error.shortMessage??error.message);process.exitCode=1;}
finally {provider?.destroy();await server.close();}
