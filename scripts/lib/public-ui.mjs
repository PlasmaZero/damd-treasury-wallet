import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {formatEther,JsonRpcProvider,keccak256} from 'ethers';
import {chromium} from '@playwright/test';
import {root} from '../compile.mjs';
import {stringify} from './public-checks.mjs';

export async function verifyFrontend({report,directory,rpcUrl,mode='public',appDir=root}) {
const file=path.join(directory,'evidence.json');
let server,browser,page;
try {
  const expectedChain=mode==='public'?11155111:1337;
  assert.ok(['public','local-rehearsal'].includes(mode));assert.equal(report.mode,mode);assert.equal(report.chainId,expectedChain);
  if(mode==='public'){
    assert.equal(report.status,'contract-and-source-checks-passed');
    assert.equal(report.sourceVerification.length,3);assert.ok(report.sourceVerification.every(v=>v.status==='verified'));
  } else assert.equal(report.status,'functional-checks-passed');
  const publicReader = new JsonRpcProvider(rpcUrl,undefined,{cacheTimeout:0});
  try {
    assert.equal(Number((await publicReader.getNetwork()).chainId),expectedChain);
    assert.equal(keccak256(await publicReader.getCode(report.wallets.primary.address)),report.wallets.primary.runtimeCodeHash);
  } finally { publicReader.destroy(); }
  report.stage = 'production frontend reads from Sepolia';
  fs.writeFileSync(file,stringify(report));
  const port = 4175;
  server = spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:appDir,stdio:['ignore','pipe','pipe']});
  let output='',startupError;
  const capture=data=>{output=(output+data.toString()).slice(-8000);};
  server.stdout.on('data',capture);server.stderr.on('data',capture);
  server.once('error',error=>{startupError=error;});
  const deadline=Date.now()+60000;
  while(true){
    if(startupError)throw startupError;
    if(server.exitCode!==null)throw Error(`Preview exited ${server.exitCode}: ${output}`);
    try{const response=await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(1000)});if(response.ok)break;}catch{/* Wait for the HTTP listener. */}
    if(Date.now()>deadline)throw Error(`Production preview startup timed out: ${output}`);
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser = await chromium.launch({headless:true});page = await browser.newPage({viewport:{width:1440,height:1100}});
  page.setDefaultTimeout(90000);
  const errors = [];page.on('pageerror',e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole('heading',{name:'Add test funds'}).waitFor();
  await page.locator('.sidebar-bottom').filter({hasText:mode==='public'?'Sepolia testnet':'Local development'}).waitFor();
  assert.equal(await page.getByLabel('Treasury wallet',{exact:true}).inputValue(),report.wallets.primary.address);
  await page.locator('.stat.hero').getByText(formatEther(BigInt(report.expected.balanceWei)),{exact:false}).waitFor();
  for (const owner of report.expected.currentOwners) assert.ok(await page.getByText(owner,{exact:true}).count() > 0);
  await page.locator('nav').getByRole('button',{name:'Proposals',exact:false}).click();
  await page.locator('article').first().waitFor();assert.equal(await page.locator('article').count(),report.expected.proposals);
  await page.locator('nav').getByRole('button',{name:'Recovery',exact:false}).click();
  await page.locator('article').first().waitFor();assert.equal(await page.locator('article').count(),report.expected.recoveries);
  await page.locator('nav').getByRole('button',{name:'Activity',exact:false}).click();
  for (const name of ['Payment Sent','Recovery Executed','Owner Replaced']) await page.getByText(name,{exact:true}).first().waitFor();
  await page.screenshot({path:path.join(directory,'public-ui-primary.png'),fullPage:true});
  await page.getByLabel('Wallet contract address',{exact:true}).fill(report.wallets.secondary.address);
  await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.locator('nav').getByRole('button',{name:'Proposals',exact:false}).click();
  await page.getByText('No proposals match this page.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Treasury wallet',{exact:true}).inputValue(),report.wallets.secondary.address);
  assert.deepEqual(errors,[]);
  report.frontend = {status:'passed',network:mode==='public'?'Sepolia':'local rehearsal',walletAdapter:'none; public read-only UI',
    assertions:['expected chain and primary address','exact primary balance and owners','proposal and recovery counts',
      'payment and recovery event history','second-wallet isolation','no browser page errors']};
  report.status = mode==='public'?'passed':'local-rehearsal-passed';report.stage = 'complete';report.completedAt = new Date().toISOString();
  console.log(mode==='public'?'Production UI checks passed against the public Sepolia deployment.':'Production UI local rehearsal passed. This is not public-testnet proof.');
} catch(error) {
  report.status = 'failed';report.frontend = {status:'failed',error:String(error.message).slice(0,700)};
  if(page) await page.screenshot({path:path.join(directory,'public-ui-failure.png'),fullPage:true}).catch(()=>{});
  throw error;
} finally {
  fs.writeFileSync(file,stringify(report));await browser?.close();
  if(server && server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}
}

return report;
}
