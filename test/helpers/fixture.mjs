import fs from 'node:fs';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,parseEther} from 'ethers';
export const E=parseEther;
export const artifact=n=>JSON.parse(fs.readFileSync(`artifacts/${n}.json`));
export async function setup() {
  const rpc=ganache.provider({wallet:{deterministic:true,totalAccounts:12,defaultBalance:1000},chain:{chainId:1337,hardfork:'merge',time:new Date('2026-01-01T12:00:00Z')},miner:{timestampIncrement:0},logging:{quiet:true}});
  const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:0});provider.pollingInterval=10;
  const accounts=await provider.send('eth_accounts',[]);
  const signers=await Promise.all(accounts.map((_,i)=>provider.getSigner(i)));
  const config={owners:await Promise.all(signers.slice(0,3).map(s=>s.getAddress())),threshold:2,guardians:await Promise.all(signers.slice(3,6).map(s=>s.getAddress())),guardianThreshold:2,limits:{perTxCap:E('2'),dailyCap:E('5'),smallTierCap:E('0.5')},delays:{smallTierDelay:2,largeTierDelay:5,governanceDelay:60,recoveryDelay:60,proposalTTL:120,recoveryTTL:120}};
  async function deploy(name,args=[],who=signers[0]) {const a=artifact(name);const c=await new ContractFactory(a.abi,a.bytecode,who).deploy(...args);await c.waitForDeployment();return c;}
  const wallet=await deploy('Treasury',[config]);
  await (await signers[0].sendTransaction({to:await wallet.getAddress(),value:E('20')})).wait();
  const mineAt=async time=>{await rpc.request({method:'evm_mine',params:[Number(time)]});};
  const advance=async seconds=>{const b=await provider.getBlock('latest');await mineAt(b.timestamp+seconds);};
  return {rpc,provider,signers,accounts:await Promise.all(signers.map(s=>s.getAddress())),config,wallet,deploy,mineAt,advance};
}
export async function sent(promise) {return (await promise).wait();}
export function events(receipt,iface) {return receipt.logs.flatMap(l=>{try{return [iface.parseLog(l)?.name].filter(Boolean);}catch{return [];}});}
export async function expectRevert(promise,name,iface) {
  try{await promise;assert.fail(`Expected ${name}`);}catch(e){
    if(e.code==='ERR_ASSERTION')throw e;
    const candidates=[e.data,e.data?.result,e.info?.error?.data,e.info?.error?.data?.result,e.error?.data];let found;
    for(const d of candidates)if(typeof d==='string'){try{found=iface.parseError(d)?.name;}catch{/* next candidate */}if(found)break;}
    assert.equal(found,name,`Expected ${name}, got ${found}: ${e.shortMessage??e.message}`);
  }
}
