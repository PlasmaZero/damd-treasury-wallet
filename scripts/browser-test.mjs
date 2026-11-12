// Automated browser tests use a local EIP-1193 adapter, NOT the MetaMask extension.
// All services are child processes in one invocation for portable CI networking.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { stripVTControlCharacters } from 'node:util';
import { getAddress } from 'ethers';
import ganache from 'ganache';
import { chromium } from '@playwright/test';

const server = ganache.server({ wallet: { deterministic: true, totalAccounts: 12, defaultBalance: 1000 }, chain: { chainId: 1337, hardfork: 'merge' }, miner: { blockTime: 1 }, logging: { quiet: true } });
let vite, browser, context, page; const errors = [];
const basePath='/damd-treasury-wallet/';
const buildEnv={...process.env,BASE_PATH:basePath,VITE_USE_MOCK:'false',VITE_CHAIN_ID:'1337',VITE_RPC_URL:'http://127.0.0.1:8545'};
const paths = ['deployments/1337.json', 'public/deployments/1337.json']; const originals = paths.map(p => fs.existsSync(p) ? fs.readFileSync(p) : null);
function run(file, args, env=process.env) { return new Promise((resolve, reject) => { const p = spawn(file, args, { stdio: 'inherit', env }); p.on('error', reject); p.on('exit', code => code === 0 ? resolve() : reject(Error(`${file} exited ${code}`))); }); }
async function mineAndRefresh(seconds) {
  await server.provider.request({method:'evm_increaseTime',params:[seconds]});
  await server.provider.request({method:'evm_mine',params:[]});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByText('Syncing…',{exact:true}).waitFor({state:'hidden',timeout:45000});
}
try {
  await server.listen(8545, '127.0.0.1'); await run(process.execPath, ['scripts/deploy.mjs']); await run(process.execPath, ['scripts/verify-deployment.mjs']);
  const accounts = Object.keys(server.provider.getInitialAccounts());
  // Test the same bundled assets and repository subpath used by GitHub Pages.
  await run(process.execPath,['node_modules/vite/bin/vite.js','build'],buildEnv);
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { env: buildEnv, stdio: 'pipe' });
  await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error('Vite startup timed out')), 15000); vite.stdout.on('data', d => { if (stripVTControlCharacters(d.toString()).includes('127.0.0.1:5174')) { clearTimeout(timeout); resolve(); } }); vite.on('error', reject); });
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}) });
  console.log(`Browser: Chromium ${browser.version()}; production base path ${basePath}`);
  context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});page=await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ accounts }) => {
    // The full UI must remain usable when a browser denies access to storage.
    Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Blocked for integration test','SecurityError');}});
    let selected = accounts[0]; const callbacks = {}; window.__setTestAccount = i => { selected = accounts[i]; for (const cb of callbacks.accountsChanged ?? []) cb([selected]); };
    window.ethereum = {
      on: (event, cb) => { (callbacks[event] ??= []).push(cb); }, removeListener: (event, cb) => { callbacks[event] = (callbacks[event] ?? []).filter(f => f !== cb); }, request: async ({ method, params = [] }) => {
        if(method==='eth_sendTransaction'&&window.__rejectNextTransaction){window.__rejectNextTransaction=false;throw Object.assign(new Error('User rejected'),{code:4001});}
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [selected];
        const response = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) }); const data = await response.json(); if (data.error) throw data.error; return data.result;
      }
    };
  }, { accounts });
  await page.goto(`http://127.0.0.1:5174${basePath}`); await page.getByRole('heading', { name: 'Add test funds' }).waitFor(); await page.getByRole('button', { name: 'Connect MetaMask', exact: true }).click();
  // Connecting reloads the treasury view, which remounts the deposit form with its 0.1 default.
  // "Review deposit" is already visible read-only, so wait for the connected owner view instead.
  await page.locator('.account-area .role').filter({ hasText: 'Owner' }).waitFor({ timeout: 25000 }); await page.getByRole('button', { name: 'Review deposit' }).waitFor();
  await page.getByRole('button',{name:'Review deposit',exact:true}).click();
  await page.getByRole('dialog').waitFor();await page.evaluate(()=>window.__setTestAccount(1));
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.evaluate(()=>window.__setTestAccount(0));
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByText('Syncing.',{exact:true}).waitFor({state:'hidden',timeout:45000});
  console.log('PASS: account changes invalidate an open transaction review.');
  const validationNav=async name=>page.locator('nav').getByRole('button',{name,exact:false}).click();
  await validationNav('Governance');
  for(const [action,label,bad,good,group]of [['SetThreshold','Threshold','6','5','owners'],['SetGuardianThreshold','Guardian Threshold','4','3','guardians']]) {
    await page.getByLabel('Action',{exact:true}).selectOption(action);
    const input=page.getByLabel(label,{exact:true}),review=page.getByRole('button',{name:'Review governance proposal',exact:true});
    await input.fill(bad);await page.getByRole('alert').filter({hasText:`cannot exceed the number of ${group}`}).waitFor();
    for(const value of [bad,'0','-1','1.5','1e0','']) {
      await input.fill(value);assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal(await review.isDisabled(),true);
    }
    await input.fill(good);assert.equal(await review.isEnabled(),true);
  }
  await page.getByLabel('Action',{exact:true}).selectOption('AddOwner');
  for(const value of [accounts[0],'0x0000000000000000000000000000000000000000',`${accounts[9]},${accounts[10]}`]) {
    await page.getByLabel('Owner',{exact:true}).fill(value);
    assert.equal(await page.getByRole('button',{name:'Review governance proposal',exact:true}).isDisabled(),true);
  }
  await validationNav('Overview');
  console.log('PASS: governance threshold boundaries, malformed numbers, duplicate/zero/multiple addresses are blocked before review.');
  await page.getByLabel('Deposit amount (ETH)').fill('1'); await page.getByRole('button', { name: 'Review deposit' }).click(); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); await page.getByText('Transaction confirmed.', { exact: true }).waitFor({ timeout: 25000 }); await page.locator('.stat.hero').filter({ hasText: '1.0 ETH' }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: 'Proposals', exact: false }).first().click();
  await page.getByLabel('Recipient address',{exact:true}).fill(`${accounts[9]},${accounts[10]}`);
  await page.getByRole('button',{name:'Review payment proposal',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Enter exactly one recipient address.'}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByLabel('Recipient address', { exact: true }).fill(accounts[9]); await page.getByLabel('Amount (ETH)', { exact: true }).fill('0.1'); await page.getByRole('button', { name: 'Review payment proposal' }).click(); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); await page.getByText('PROPOSAL #0', { exact: false }).waitFor({ timeout: 25000 });
  const proposal = page.locator('article').filter({ hasText: 'PROPOSAL #0' });
  for (const index of [1, 2]) { await page.evaluate(i => window.__setTestAccount(i), index); await proposal.getByRole('button', { name: 'Approve', exact: true }).click(); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); await page.getByText('Transaction confirmed.', { exact: true }).waitFor({ timeout: 25000 }); }
  await proposal.getByText('3/3 approvals', { exact: true }).waitFor();
  await mineAndRefresh(16); await proposal.getByRole('button', { name: 'Execute', exact: true }).click({ timeout: 25000 }); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); await proposal.locator('.badge').filter({ hasText: 'Executed' }).waitFor({ timeout: 25000 }); console.log('PASS: browser deposit and payment.');
  // Governance through the browser.
  await page.evaluate(() => window.__setTestAccount(0)); await page.getByRole('button', { name: 'Governance', exact: false }).first().click(); await page.getByLabel('Action', { exact: true }).selectOption('AddOwner'); await page.getByLabel('Owner', { exact: true }).fill(accounts[10]); await page.getByRole('button', { name: 'Review governance proposal' }).click(); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); await page.getByText('Transaction confirmed.', { exact: true }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: 'Proposals', exact: false }).first().click(); const g = page.locator('article').filter({ hasText: 'PROPOSAL #1' });
  for (const i of [1, 2]) { await page.evaluate(i => window.__setTestAccount(i), i); await g.getByRole('button', { name: 'Approve', exact: true }).click(); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); await page.getByText('Transaction confirmed.', { exact: true }).waitFor({ timeout: 25000 }); }
  await g.getByText('3/3 approvals', { exact: true }).waitFor();
  await mineAndRefresh(121); await g.getByRole('button', { name: 'Execute', exact: true }).click({ timeout: 25000 }); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); await g.locator('.badge').filter({ hasText: 'Executed' }).waitFor({ timeout: 25000 }); console.log('PASS: browser governance.');
  // Recovery: guardian 5 initiates, guardian 6 approves, account 8 confirms and executes.
  await page.evaluate(() => window.__setTestAccount(5)); await page.getByRole('button', { name: 'Recovery', exact: false }).first().click(); await page.getByLabel('Lost owner address').selectOption({ label: getAddress(accounts[4]) });
  await page.getByLabel('New owner address', { exact: true }).fill(accounts[8]); await page.getByRole('button', { name: 'Review recovery request' }).click(); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); const r = page.locator('article').filter({ hasText: 'Recovery #0' }); await r.waitFor({ timeout: 25000 });
  await page.evaluate(() => window.__setTestAccount(6)); await r.getByRole('button', { name: 'Approve', exact: true }).click(); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); await page.getByText('Transaction confirmed.', { exact: true }).waitFor({ timeout: 25000 });
  await page.evaluate(() => window.__setTestAccount(8)); await r.getByRole('button', { name: 'Confirm new account' }).click(); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); await page.getByText('Transaction confirmed.', { exact: true }).waitFor({ timeout: 25000 }); await r.getByText('New owner confirmed', { exact: true }).waitFor(); await r.getByText('2/2 guardian approvals', { exact: true }).waitFor(); await mineAndRefresh(181); await r.getByRole('button', { name: 'Execute recovery' }).click({ timeout: 25000 }); await page.getByRole('button', { name: 'Confirm in MetaMask' }).click(); await r.locator('.badge').filter({ hasText: 'Executed' }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: 'Activity', exact: false }).first().click(); await page.getByText('Recovery Executed', { exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Overview', exact: false }).first().click(); await page.getByRole('heading', { name: 'Add test funds' }).waitFor();
  // M4 regression checks: independent treasuries and cancellation/failure UI.
  const nav=async name=>{await page.locator('nav').getByRole('button',{name,exact:false}).click();};
  const account=async i=>{await page.evaluate(i=>window.__setTestAccount(i),i);await page.getByText('Syncing…',{exact:true}).waitFor({state:'hidden'});};
  const confirm=async()=>{await page.getByRole('button',{name:'Confirm in MetaMask',exact:true}).click();await page.getByText('Transaction confirmed.',{exact:true}).waitFor({timeout:25000});};
  const advance=async seconds=>{await server.provider.request({method:'evm_increaseTime',params:[seconds]});await server.provider.request({method:'evm_mine',params:[]});await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Syncing…',{exact:true}).waitFor({state:'hidden'});};
  const originalWallet=await page.getByLabel('Treasury wallet',{exact:true}).inputValue();
  await account(0);await nav('Governance');
  await page.getByLabel('Action',{exact:true}).selectOption('SetGuardianThreshold');
  await page.getByLabel('Guardian Threshold',{exact:true}).fill('1');
  await page.getByText('One guardian can authorize a recovery request.',{exact:false}).waitFor();
  await page.getByLabel('Action',{exact:true}).selectOption('RemoveGuardian');
  await page.getByLabel('Guardian',{exact:true}).fill(accounts[7]);
  await page.getByText('Recovery requires every guardian.',{exact:false}).waitFor();
  await nav('Create wallet');
  await page.getByLabel('Owners',{exact:true}).fill(accounts.slice(0,3).join(', '));
  await page.getByLabel('Guardians',{exact:true}).fill(accounts.slice(5,7).join(', '));
  const createReview=page.getByRole('button',{name:'Review wallet creation',exact:true});
  for(const bad of ['4','0','-1','1.5','1e0','']) {
    await page.getByLabel('Owner threshold',{exact:true}).fill(bad);assert.equal(await createReview.isDisabled(),true);
    assert.equal(await page.getByLabel('Owner threshold',{exact:true}).getAttribute('aria-invalid'),'true');
  }
  await page.getByLabel('Owner threshold',{exact:true}).fill('4');
  await page.getByLabel('Guardian threshold',{exact:true}).fill('3');
  await page.getByRole('alert').filter({hasText:'Owner threshold cannot exceed the number of owners (3).'}).waitFor();
  await page.getByRole('alert').filter({hasText:'Guardian threshold cannot exceed the number of guardians (2).'}).waitFor();
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/validation.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/validation-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Validation errors overflow on mobile');
  await page.setViewportSize({width:1440,height:1100});
  await page.getByLabel('Owner threshold',{exact:true}).fill('3');
  for(const bad of ['3','0','-1','1.5','1e0','']) {
    await page.getByLabel('Guardian threshold',{exact:true}).fill(bad);assert.equal(await createReview.isDisabled(),true);
  }
  await page.getByLabel('Guardian threshold',{exact:true}).fill('2');assert.equal(await createReview.isEnabled(),true);
  await page.getByLabel('Owners',{exact:true}).fill(`${accounts[0]},${accounts[0]},${accounts[2]}`);assert.equal(await createReview.isDisabled(),true);
  await page.getByLabel('Owners',{exact:true}).fill(accounts.slice(0,3).join(', '));assert.equal(await createReview.isEnabled(),true);
  console.log('PASS: creation validates owner/guardian threshold boundaries, invalid numbers, duplicate members and mobile error layout.');
  await page.getByLabel('Owner threshold',{exact:true}).fill('1');
  await page.getByText('One owner can authorize payments and governance changes.',{exact:false}).waitFor();
  await page.getByLabel('Owner threshold',{exact:true}).fill('2');
  await page.getByRole('button',{name:'Review wallet creation',exact:true}).click();await confirm();
  await page.getByRole('heading',{name:'Add test funds'}).waitFor();
  const secondWallet=await page.getByLabel('Treasury wallet',{exact:true}).inputValue();assert.notEqual(secondWallet,originalWallet);console.log('PASS: browser independent wallet creation and threshold warning.');
  await nav('Governance');await page.getByLabel('Action',{exact:true}).selectOption('RemoveGuardian');
  await page.getByLabel('Guardian',{exact:true}).fill(accounts[5]);
  await page.getByRole('alert').filter({hasText:'Lower the threshold first.'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Review governance proposal',exact:true}).isDisabled(),true);
  await page.getByLabel('Action',{exact:true}).selectOption('RemoveOwner');
  await page.getByLabel('Owner',{exact:true}).fill(accounts[2]);
  await page.getByText('Other owners cannot reach the recovery cancellation threshold',{exact:false}).waitFor();
  await nav('Overview');
  assert.match(await page.locator('.stat.hero').innerText(),/0\.0 ETH/);
  await page.getByLabel('Deposit amount (ETH)').fill('0.2');
  await page.getByRole('button',{name:'Review deposit',exact:true}).click();
  await page.evaluate(()=>window.__rejectNextTransaction=true);
  await page.getByRole('button',{name:'Confirm in MetaMask',exact:true}).click();
  await page.getByText('You rejected the request in MetaMask.',{exact:false}).waitFor({timeout:25000});
  await page.getByRole('button',{name:'Review deposit',exact:true}).click();await confirm();
  await page.getByLabel('Treasury wallet',{exact:true}).selectOption(originalWallet);
  await page.getByText('Syncing…',{exact:true}).waitFor({state:'hidden'});
  await page.locator('.stat.hero').filter({hasText:/0\.9 ETH/}).waitFor({timeout:45000});
  await page.getByLabel('Treasury wallet',{exact:true}).selectOption(secondWallet);
  await nav('Proposals');await page.getByText('No proposals match this page.',{exact:true}).waitFor();
  const propose=async()=>{await page.getByLabel('Recipient address',{exact:true}).fill(accounts[9]);await page.getByLabel('Amount (ETH)',{exact:true}).fill('0.1');await page.getByRole('button',{name:'Review payment proposal',exact:true}).click();await confirm();};
  await propose();const cancelledPayment=page.locator('article').filter({hasText:'PROPOSAL #0'});
  assert.equal(await cancelledPayment.getByRole('button',{name:'Execute',exact:true}).isDisabled(),true);
  await account(1);await cancelledPayment.getByRole('button',{name:'Approve',exact:true}).click();await confirm();
  await cancelledPayment.locator('.badge').filter({hasText:'Queued'}).waitFor();
  assert.equal(await cancelledPayment.getByRole('button',{name:'Execute',exact:true}).isDisabled(),true);
  // The contract/service regression suite independently checks the timelock revert.
  await advance(16);await cancelledPayment.locator('.badge').filter({hasText:'Ready'}).waitFor();
  await cancelledPayment.getByRole('button',{name:'Vote to cancel',exact:true}).click();await confirm();
  await account(0);await cancelledPayment.getByRole('button',{name:'Vote to cancel',exact:true}).click();await confirm();
  await cancelledPayment.locator('.badge').filter({hasText:'Cancelled'}).waitFor();
  await propose();await advance(86401);
  await page.locator('article').filter({hasText:'PROPOSAL #1'}).locator('.badge').filter({hasText:'Expired'}).waitFor();
  console.log('PASS: browser signature rejection/retry, treasury isolation, cancellation and expiry.');
  await account(5);await nav('Recovery');
  const requestRecovery=async()=>{await page.getByLabel('Lost owner address').selectOption({label:getAddress(accounts[2])});await page.getByLabel('New owner address',{exact:true}).fill(accounts[8]);await page.getByRole('button',{name:'Review recovery request',exact:true}).click();await confirm();};
  await requestRecovery();const direct=page.locator('article').filter({hasText:'Recovery #0'});
  await account(2);await direct.getByRole('button',{name:'Cancel directly',exact:true}).click();await confirm();await direct.locator('.badge').filter({hasText:'Cancelled'}).waitFor();
  await account(5);await requestRecovery();const voted=page.locator('article').filter({hasText:'Recovery #1'});
  await account(6);await voted.getByRole('button',{name:'Approve',exact:true}).click();await confirm();
  for(const i of [0,1]){await account(i);await voted.getByRole('button',{name:'Vote to cancel',exact:true}).click();await confirm();}
  await voted.locator('.badge').filter({hasText:'Cancelled'}).waitFor();
  await account(5);await requestRecovery();
  await account(0);await nav('Governance');
  await page.getByLabel('Action',{exact:true}).selectOption('ReplaceOwner');
  await page.getByLabel('Old Owner',{exact:true}).fill(accounts[2]);
  await page.getByLabel('New Owner',{exact:true}).fill(accounts[10]);
  await page.getByRole('button',{name:'Review governance proposal',exact:true}).click();await confirm();
  await nav('Proposals');const replacement=page.locator('article').filter({hasText:'PROPOSAL #2'});
  await account(1);await replacement.getByRole('button',{name:'Approve',exact:true}).click();await confirm();
  await advance(121);await replacement.getByRole('button',{name:'Execute',exact:true}).click();await confirm();
  await nav('Recovery');const stale=page.locator('article').filter({hasText:'Recovery #2'});
  await stale.locator('.badge').filter({hasText:'Invalidated'}).waitFor();
  await stale.locator('.notice').getByText('The targeted owner membership was removed or replaced.',{exact:false}).waitFor();
  assert.equal(await stale.getByRole('button',{name:'Execute recovery',exact:true}).isDisabled(),true);
  await account(2);await stale.getByRole('button',{name:'Cancel directly',exact:true}).click();await confirm();
  await stale.locator('.badge').filter({hasText:'Cancelled'}).waitFor();
  console.log('PASS: M4 multi-treasury isolation, low-threshold warning, signature rejection, early-execution UI guard, payment cancellation/expiry and both recovery cancellation routes.');
  await nav('Overview');await page.getByRole('heading',{name:'Add test funds'}).waitFor();

  fs.mkdirSync('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'test-results/mobile.png', fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Mobile has horizontal overflow');
  assert.deepEqual(errors, []); console.log('PASS: browser connect, deposit, multi-account payment, governance, full recovery, history, desktop and mobile.');
} catch (error) {
  console.error('Browser errors:', errors); if (page) { fs.mkdirSync('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/failure.png', fullPage: true }); console.error((await page.locator('body').innerText()).slice(0, 6000)); } throw error;
} finally {
  try {
    try {
      if(context){fs.mkdirSync('test-results',{recursive:true});await context.tracing.stop({path:'test-results/browser-trace.zip'});}
    } finally {
      await browser?.close();
      if (vite&&vite.exitCode===null&&vite.signalCode===null) { vite.kill(); await once(vite, 'exit').catch(() => { }); }
      await server.close();
    }
  } finally {
    paths.forEach((p, i) => { if (originals[i]) fs.writeFileSync(p, originals[i]); else fs.rmSync(p, { force: true }); });
  }
}

