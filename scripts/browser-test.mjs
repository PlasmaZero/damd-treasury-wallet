// Automated browser tests use a local EIP-1193 adapter, NOT the MetaMask extension.
// All services are child processes in one invocation for portable CI networking.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {getAddress} from 'ethers';
import ganache from 'ganache';
import {chromium} from '@playwright/test';
const server=ganache.server({wallet:{deterministic:true,totalAccounts:12,defaultBalance:1000},chain:{chainId:1337,hardfork:'merge'},miner:{blockTime:1},logging:{quiet:true}});
let vite,browser,page;const errors=[];
const paths=['deployments/1337.json','public/deployments/1337.json'];const originals=paths.map(p=>fs.existsSync(p)?fs.readFileSync(p):null);
function run(file,args){return new Promise((resolve,reject)=>{const p=spawn(file,args,{stdio:'inherit',env:process.env});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(`${file} exited ${code}`)));});}
try{
 await server.listen(8545,'127.0.0.1');await run(process.execPath,['scripts/deploy.mjs']);
 const accounts=Object.keys(server.provider.getInitialAccounts());
 vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174'],{env:{...process.env,VITE_USE_MOCK:'false',VITE_CHAIN_ID:'1337',VITE_RPC_URL:'http://127.0.0.1:8545'},stdio:'pipe'});
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Vite startup timed out')),15000);vite.stdout.on('data',d=>{if(d.toString().includes('127.0.0.1:5174')){clearTimeout(timeout);resolve();}});vite.on('error',reject);});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1440,height:1100}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({accounts})=>{
  let selected=accounts[0];const callbacks={};window.__setTestAccount=i=>{selected=accounts[i];for(const cb of callbacks.accountsChanged??[])cb([selected]);};
  window.ethereum={on:(event,cb)=>{(callbacks[event]??=[]).push(cb);},removeListener:(event,cb)=>{callbacks[event]=(callbacks[event]??[]).filter(f=>f!==cb);},request:async({method,params=[]})=>{
    if(method==='eth_requestAccounts'||method==='eth_accounts')return [selected];
    const response=await fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})});const data=await response.json();if(data.error)throw data.error;return data.result;
  }};
 },{accounts});
 await page.goto('http://127.0.0.1:5174');await page.getByRole('heading',{name:'Add test funds'}).waitFor();await page.getByRole('button',{name:'Connect MetaMask',exact:true}).click();await page.getByRole('button',{name:'Review deposit'}).waitFor();
 await page.getByLabel('Deposit amount (ETH)').fill('1');await page.getByRole('button',{name:'Review deposit'}).click();await page.getByRole('button',{name:'Confirm in MetaMask'}).click();await page.getByText('Transaction confirmed.',{exact:true}).waitFor({timeout:25000});
 await page.getByRole('button',{name:'Proposals',exact:false}).first().click();await page.getByLabel('Recipient address',{exact:true}).fill(accounts[9]);await page.getByLabel('Amount (ETH)',{exact:true}).fill('0.1');await page.getByRole('button',{name:'Review payment proposal'}).click();await page.getByRole('button',{name:'Confirm in MetaMask'}).click();await page.getByText('PROPOSAL #0',{exact:false}).waitFor({timeout:25000});
 const proposal=page.locator('article').filter({hasText:'PROPOSAL #0'});
 for(const index of [1,2]){await page.evaluate(i=>window.__setTestAccount(i),index);await proposal.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('button',{name:'Confirm in MetaMask'}).click();await page.getByText('Transaction confirmed.',{exact:true}).waitFor({timeout:25000});}
 await proposal.getByText('3/3 approvals',{exact:true}).waitFor();
 await server.provider.request({method:'evm_increaseTime',params:[16]});await server.provider.request({method:'evm_mine',params:[]});await proposal.getByRole('button',{name:'Execute',exact:true}).click({timeout:25000});await page.getByRole('button',{name:'Confirm in MetaMask'}).click();await proposal.locator('.badge').filter({hasText:'Executed'}).waitFor({timeout:25000});console.log('PASS: browser deposit and payment.');
 // Governance through the browser.
 await page.evaluate(()=>window.__setTestAccount(0));await page.getByRole('button',{name:'Governance',exact:false}).first().click();await page.getByLabel('Action',{exact:true}).selectOption('AddOwner');await page.getByLabel('Owner',{exact:true}).fill(accounts[10]);await page.getByRole('button',{name:'Review governance proposal'}).click();await page.getByRole('button',{name:'Confirm in MetaMask'}).click();await page.getByText('Transaction confirmed.',{exact:true}).waitFor({timeout:25000});
 await page.getByRole('button',{name:'Proposals',exact:false}).first().click();const g=page.locator('article').filter({hasText:'PROPOSAL #1'});
 for(const i of [1,2]){await page.evaluate(i=>window.__setTestAccount(i),i);await g.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('button',{name:'Confirm in MetaMask'}).click();await page.getByText('Transaction confirmed.',{exact:true}).waitFor({timeout:25000});}
 await g.getByText('3/3 approvals',{exact:true}).waitFor();
 await server.provider.request({method:'evm_increaseTime',params:[121]});await server.provider.request({method:'evm_mine',params:[]});await g.getByRole('button',{name:'Execute',exact:true}).click({timeout:25000});await page.getByRole('button',{name:'Confirm in MetaMask'}).click();await g.locator('.badge').filter({hasText:'Executed'}).waitFor({timeout:25000});console.log('PASS: browser governance.');
 // Recovery: guardian 5 initiates, guardian 6 approves, account 8 confirms and executes.
 await page.evaluate(()=>window.__setTestAccount(5));await page.getByRole('button',{name:'Recovery',exact:false}).first().click();await page.getByLabel('Lost owner address').selectOption({label:getAddress(accounts[4])});
 await page.getByLabel('New owner address',{exact:true}).fill(accounts[8]);await page.getByRole('button',{name:'Review recovery request'}).click();await page.getByRole('button',{name:'Confirm in MetaMask'}).click();const r=page.locator('article').filter({hasText:'Recovery #0'});await r.waitFor({timeout:25000});
 await page.evaluate(()=>window.__setTestAccount(6));await r.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('button',{name:'Confirm in MetaMask'}).click();await page.getByText('Transaction confirmed.',{exact:true}).waitFor({timeout:25000});
 await page.evaluate(()=>window.__setTestAccount(8));await r.getByRole('button',{name:'Confirm new account'}).click();await page.getByRole('button',{name:'Confirm in MetaMask'}).click();await page.getByText('Transaction confirmed.',{exact:true}).waitFor({timeout:25000});await r.getByText('New owner confirmed',{exact:true}).waitFor();await r.getByText('2/2 guardian approvals',{exact:true}).waitFor();await server.provider.request({method:'evm_increaseTime',params:[181]});await server.provider.request({method:'evm_mine',params:[]});await r.getByRole('button',{name:'Execute recovery'}).click({timeout:25000});await page.getByRole('button',{name:'Confirm in MetaMask'}).click();await r.locator('.badge').filter({hasText:'Executed'}).waitFor({timeout:25000});
 await page.getByRole('button',{name:'Activity',exact:false}).first().click();await page.getByText('Recovery Executed',{exact:true}).waitFor({timeout:20000});
 await page.getByRole('button',{name:'Overview',exact:false}).first().click();await page.getByRole('heading',{name:'Add test funds'}).waitFor();
 fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Mobile has horizontal overflow');
 assert.deepEqual(errors,[]);console.log('PASS: browser connect, deposit, multi-account payment, governance, full recovery, history, desktop and mobile.');
}catch(error){
 console.error('Browser errors:',errors); if(page){fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(0,6000));}throw error;
}finally{
 await browser?.close();if(vite){vite.kill();await once(vite,'exit').catch(()=>{});}await server.close();
 paths.forEach((p,i)=>{if(originals[i])fs.writeFileSync(p,originals[i]);else fs.rmSync(p,{force:true});});
}
