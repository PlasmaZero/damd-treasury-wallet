import { BrowserProvider, Contract, Interface, JsonRpcProvider, getAddress, toQuantity } from 'ethers';
import treasuryAbi from '../contract/abi/Treasury.json' with {type:'json'};
import factoryAbi from '../contract/abi/TreasuryFactory.json' with {type:'json'};
import {ACTION_TYPES,STATUS,decodeParams,describeAction,encodeParams,validateConfig} from '../contract/params.js';
import {toTxError} from '../contract/errors.js';
import {withMissingBlockRetry} from './rpcRetry.js';

// Logs this close to the head are rescanned on each incremental scan in case of a reorg.
const REORG_DEPTH=5;
const CHAINS={1337:{chainName:'DAMD Local'},11155111:{chainName:'Sepolia',blockExplorerUrls:['https://sepolia.etherscan.io']}};

export function createWalletService(config) {
  const ethereum=config.ethereum??globalThis.window?.ethereum;
  // staticNetwork stops ethers sending eth_chainId before most reads (it was ~40% of all RPC calls);
  // assertNetwork checks the RPC's chain once instead. Sepolia mines every ~12s, so poll less often.
  const provider=config.provider??withMissingBlockRetry(new JsonRpcProvider(config.rpcUrl,config.chainId,{staticNetwork:true,cacheTimeout:0,pollingInterval:config.chainId===1337?2000:4000}));
  let rpcChain=null;
  let account=null, session=0;
  const listeners=new Set();
  let storage=config.storage;
  // Browser privacy settings can throw even when accessing localStorage itself.
  if(storage==null) {try {storage=globalThis.localStorage;} catch {/* retain wallets in memory */}}
  const key=`damd:${config.chainId}:wallets`;
  let known=[]; try {known=JSON.parse(storage?.getItem(key)??'[]').map(getAddress);} catch {known=[];}
  const iface=new Interface(treasuryAbi);
  const factoryInterface=new Interface([...factoryAbi,...treasuryAbi.filter(x=>x.type==='error')]);
  const treasury=a=>new Contract(getAddress(a),treasuryAbi,provider);
  const factory=()=>{if(!config.factory) throw Error('Deploy the factory first with npm run deploy.');return new Contract(config.factory,factoryInterface,provider);};
  const notify=()=>listeners.forEach(cb=>cb());
  const changed=accounts=>{session++;account=Array.isArray(accounts)&&accounts[0]?getAddress(accounts[0]):null;notify();};
  // Keep the account when MetaMask lands on the configured chain (e.g. after switchChain).
  const chainChanged=id=>{session++;if(Number(id)!==config.chainId)account=null;notify();};
  ethereum?.on?.('accountsChanged',changed); ethereum?.on?.('chainChanged',chainChanged); ethereum?.on?.('disconnect',chainChanged);
  async function assertNetwork() {
    rpcChain??=provider.send('eth_chainId',[]).then(Number).catch(e=>{rpcChain=null;throw e;});
    if(await rpcChain!==config.chainId) throw Object.assign(new Error('RPC network does not match the selected network.'),{code:'WRONG_NETWORK'});
    if(ethereum&&Number(await ethereum.request({method:'eth_chainId'}))!==config.chainId) throw toTxError({code:'WRONG_NETWORK'});
  }
  async function switchChain() {
    if(Number(await ethereum.request({method:'eth_chainId'}))===config.chainId) return;
    const chainId=toQuantity(config.chainId);
    try {await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId}]});}
    catch(e) {
      if(e.code===4001) throw e;
      // 4902: MetaMask does not know this chain yet. Other failures fall through to assertNetwork.
      if(e.code!==4902&&e.data?.originalError?.code!==4902) return;
      const extra=CHAINS[config.chainId]??{chainName:`Chain ${config.chainId}`};
      await ethereum.request({method:'wallet_addEthereumChain',params:[{chainId,nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[config.rpcUrl],...extra}]});
    }
  }
  async function signer() {
    if(!ethereum) throw Error('Install MetaMask to sign transactions.');
    if(!account) throw Error('Connect MetaMask first.');
    await assertNetwork();
    const browser=new BrowserProvider(ethereum,'any',{cacheTimeout:0});
    const s=await browser.getSigner(account);
    if((await s.getAddress()).toLowerCase()!==account.toLowerCase()) throw Error('Wallet account changed. Connect again.');
    return s;
  }
  const normalizeConfig=c=>({owners:[...c.owners],guardians:[...c.guardians],threshold:Number(c.threshold),guardianThreshold:Number(c.guardianThreshold),limits:Object.fromEntries(['perTxCap','dailyCap','smallTierCap'].map(k=>[k,c.limits[k]])),delays:Object.fromEntries(['smallTierDelay','largeTierDelay','governanceDelay','recoveryDelay','proposalTTL','recoveryTTL'].map(k=>[k,Number(c.delays[k])]))});
  // Code and config cannot change within a block, so a snapshot and both lists in one refresh
  // share a single getCode/getConfig read for that block instead of repeating it three times.
  let cached=null;
  async function context(wallet) {
    const c=treasury(wallet); const block=await provider.getBlock('latest');
    if(!block) throw Error('No block received from RPC.');
    const tag={blockTag:block.number},id=`${getAddress(wallet)}@${block.hash}`;
    if(cached?.id!==id) cached={id,cfg:(async()=>{
      if(await provider.getCode(wallet,block.number)==='0x') throw Error('No treasury contract at this address. Redeploy after restarting the local chain.');
      return normalizeConfig(await c.getConfig(tag));
    })()};
    const entry=cached;let cfg;
    try {cfg=await entry.cfg;} catch(e) {if(cached===entry)cached=null;throw e;}
    return {c,block,tag,cfg};
  }
  async function snapshot(wallet) {
    const {c,block,tag,cfg}=await context(wallet);
    const [balance,cancelThreshold,spentToday,remainingToday,pc,rc,active]=await Promise.all([provider.getBalance(wallet,block.number),c.cancelThreshold(tag),c.spentToday(tag),c.remainingToday(tag),c.proposalCount(tag),c.recoveryCount(tag),account?c.activeRecoveryFor(account,tag):[false,0n]]);
    return {address:getAddress(wallet),balance,chainTime:block.timestamp,blockNumber:block.number,config:cfg,cancelThreshold:Number(cancelThreshold),spentToday,remainingToday,proposalCount:Number(pc),recoveryCount:Number(rc),me:{account,roles:{isOwner:cfg.owners.includes(account),isGuardian:cfg.guardians.includes(account)},activeRecoveryAgainstMe:active[0]?Number(active[1]):null}};
  }
  async function votes(c,method,id,members,needed,tag) {
    const yes=await Promise.all(members.map(a=>c[method](id,a,tag))); const by=members.filter((_,i)=>yes[i]);return {count:by.length,needed,by};
  }
  function viewStatus(r,now) {const name=STATUS[Number(r.status)];return name==='Queued'&&now>=Number(r.readyAt)?'Ready':name;}
  async function proposalView(id,ctx) {
    const {c,cfg,block,tag}=ctx,r=await c.getProposal(id,tag),action=ACTION_TYPES[Number(r.action)],params=decodeParams(action,r.params);
    const [approvals,cancelVotes]=await Promise.all([votes(c,'hasApproved',id,cfg.owners,cfg.threshold,tag),votes(c,'hasVotedCancel',id,cfg.owners,cfg.owners.length-cfg.threshold+1,tag)]);
    return {id,action,params,summary:describeAction(action,params),proposer:r.proposer,createdAt:Number(r.createdAt),readyAt:Number(r.readyAt),expiresAt:Number(r.expiresAt),status:viewStatus(r,block.timestamp),approvals,cancelVotes};
  }
  async function recoveryView(id,ctx) {
    const {c,cfg,block,tag}=ctx,r=await c.getRecovery(id,tag);
    const [approvals,cancelVotes]=await Promise.all([votes(c,'hasRecoveryApproval',id,cfg.guardians,cfg.guardianThreshold,tag),votes(c,'hasVotedCancelRecovery',id,cfg.owners.filter(a=>a!==r.oldOwner),cfg.threshold,tag)]);
    const contractStatus=viewStatus(r,block.timestamp);
    const isActive=['Pending','Queued','Ready'].includes(contractStatus);
    const invalidated=isActive&&!await c.isRecoveryTargetCurrent(id,tag);
    const blockedReason=invalidated?'The targeted owner membership was removed or replaced. This recovery cannot execute; cancel it or let it expire.':isActive&&(cfg.owners.includes(r.newOwner)||cfg.guardians.includes(r.newOwner))?'The replacement address is already a member. Choose a fresh address in a new request, or resolve the membership conflict.':null;
    return {id,oldOwner:r.oldOwner,newOwner:r.newOwner,initiator:r.initiator,createdAt:Number(r.createdAt),readyAt:Number(r.readyAt),expiresAt:Number(r.expiresAt),newOwnerConfirmed:r.newOwnerConfirmed,contractStatus,status:invalidated?'Invalidated':contractStatus,blockedReason,approvals,cancelVotes};
  }
  async function list(wallet,opts={},recovery=false) {
    const ctx=await context(wallet);const count=Number(await ctx.c[recovery?'recoveryCount':'proposalCount'](ctx.tag));
    const offset=opts.offset??0,limit=Math.min(opts.limit??50,50),items=[];
    // Sequential rows avoid overloading free RPC endpoints; each row batches its reads.
    for(let id=count-1-offset;id>=0&&items.length<limit;id--) items.push(await (recovery?recoveryView:proposalView)(id,ctx));
    return items;
  }
  function request(method,args) {
    if(method==='proposeAction') return [ACTION_TYPES[args[0]],encodeParams(args[0],args[1])];
    return args;
  }
  async function preview(wallet,method,args=[]) {
    try {
      if(!account) throw Error('Connect MetaMask first.'); await assertNetwork();
      if(method==='deposit') {if(BigInt(args[0])<=0n) throw Error('Deposit must be positive.');await provider.call({to:wallet,from:account,value:args[0]});}
      else if(method==='createWallet') {validateConfig(args[0]);await factory().createWallet.staticCall(args[0],{from:account});}
      else await treasury(wallet)[method].staticCall(...request(method,args),{from:account});
      return {ok:true};
    } catch(error) {return {ok:false,error:toTxError(error,method==='createWallet'?factoryInterface:iface)};}
  }
  async function write(wallet,method,args,opts={}) {
    const token=session,who=account;const s=await signer();
    const result=await preview(wallet,method,args);if(!result.ok) throw result.error;
    if(token!==session||who!==account) throw Error('Account or network changed. Review the action again.');
    try {
      const tx=method==='deposit'?await s.sendTransaction({to:wallet,value:args[0]}):await (method==='createWallet'?factory():treasury(wallet)).connect(s)[method](...request(method,args));
      opts.onSubmitted?.(tx.hash);
      let receipt;
      try {receipt=await tx.wait(1);} catch(e) {if(e.code==='TRANSACTION_REPLACED'&&!e.cancelled) receipt=e.receipt;else throw e;}
      if(receipt.status!==1) throw Error('Transaction reverted.');
      const output={txHash:receipt.hash,blockNumber:receipt.blockNumber};
      for(const log of receipt.logs) {
        let event;try{event=(method==='createWallet'?factoryInterface:iface).parseLog(log);}catch{continue;}
        if(event?.name==='WalletCreated') {output.wallet=event.args.wallet;addKnownWallet(output.wallet);}
        if(event?.name==='ProposalCreated'||event?.name==='RecoveryInitiated') output.id=Number(event.args.id);
      }
      return output;
    } catch(e) {throw toTxError(e,method==='createWallet'?factoryInterface:iface);}
  }
  function addKnownWallet(a) {
    a=getAddress(a);if(!known.includes(a)) known.push(a);
    // Persistence is optional. A quota/privacy error must not turn a mined
    // createWallet transaction into an apparent failure (or block app setup).
    try {storage?.setItem(key,JSON.stringify(known));} catch {/* in-memory list remains usable */}
  }
  function subscribe(wallet,cb) {
    let timer,stopped=false;
    const invalidate=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!stopped)cb();},150);};
    // Every wallet event lands in a new block, so the block subscription alone triggers refreshes;
    // a separate log filter only duplicated them. Timelock status also only moves with blocks.
    provider.on('block',invalidate);
    // Slow fallback in case block polling stalls (e.g. a flaky RPC).
    const heartbeat=setInterval(invalidate,30000);
    globalThis.window?.addEventListener('focus',invalidate); listeners.add(invalidate);
    return ()=>{stopped=true;clearTimeout(timer);clearInterval(heartbeat);provider.off('block',invalidate);listeners.delete(invalidate);globalThis.window?.removeEventListener('focus',invalidate);};
  }
  async function scanLogs(filter,start,end) {
    let size=2000;const result=[];
    while(start<=end) {
      const to=Math.min(start+size-1,end);let logs;
      try{logs=await provider.getLogs({...filter,fromBlock:start,toBlock:to});}catch(error){if(size===1)throw error;size=Math.max(1,Math.floor(size/2));continue;}
      result.push(...logs);start=to+1;
    }
    return result;
  }
  // Log scans were full rescans from deployment on every call (wallet discovery after each
  // transaction, Activity on each block), so their cost grew with chain age. Keep what was
  // scanned and fetch only new blocks, re-reading the last few in case of a reorg.
  // Calls for one key run in order so concurrent refreshes share the work.
  const scans=new Map(),scanQueue=new Map();
  function scanIncremental(key,filter,first,end) {
    const run=(scanQueue.get(key)??Promise.resolve()).catch(()=>{}).then(async()=>{
      const s=scans.get(key)??{to:first-1,logs:[]};
      const from=Math.max(first,s.to-REORG_DEPTH+1);
      if(from<=end) scans.set(key,{to:end,logs:[...s.logs.filter(l=>l.blockNumber<from),...await scanLogs(filter,from,end)]});
      return scans.get(key)?.logs??[];
    });
    scanQueue.set(key,run);return run;
  }
  const deployBlocks=new Map();
  function deployedAt(key,read) {
    if(!deployBlocks.has(key)) deployBlocks.set(key,read().then(Number).catch(e=>{deployBlocks.delete(key);throw e;}));
    return deployBlocks.get(key);
  }
  const api={
    async connect() {
      if(!ethereum) throw Error('Install MetaMask to connect a wallet.');
      try {const a=await ethereum.request({method:'eth_requestAccounts'});await switchChain();await assertNetwork();account=getAddress(a[0]);session++;notify();return account;}catch(e){throw toTxError(e,iface);}
    },getAccount:()=>account,
    onAccountOrChainChange(cb) {listeners.add(cb);return ()=>listeners.delete(cb);},
    async listWallets(a) {
      const found=[];const end=await provider.getBlockNumber();
      if(a&&config.factory) {
        // Creation-time indexing misses later governance/recovery members. Discover the
        // factory's wallets, then check authoritative membership at one block.
        const f=factory(),start=await deployedAt(`factory:${config.factory}`,()=>Number.isInteger(config.factoryDeployedAtBlock)?Promise.resolve(config.factoryDeployedAtBlock):f.deployedAtBlock());
        const logs=await scanIncremental(`factory:${config.factory}`,{address:config.factory,topics:[factoryInterface.getEvent('WalletCreated').topicHash]},start,end);
        for(const log of logs)found.push(getAddress(factoryInterface.parseLog(log).args.wallet));
      }
      const wallets=[...new Set(found)],tag={blockTag:end};
      const member=await Promise.all(wallets.map(async w=>{const c=treasury(w);const [o,g]=await Promise.all([c.isOwner(a,tag),c.isGuardian(a,tag)]);return o||g;}));
      return [...new Set([...wallets.filter((_,i)=>member[i]),...known])];
    },addKnownWallet,snapshot,preview,subscribe,
    listProposals:(w,o)=>list(w,o),getProposal:async(w,id)=>proposalView(id,await context(w)),
    listRecoveries:(w,o)=>list(w,o,true),getRecovery:async(w,id)=>recoveryView(id,await context(w)),
    async getHistory(wallet) {
      const w=getAddress(wallet),c=treasury(w),end=await provider.getBlockNumber(),result=[];
      const logs=await scanIncremental(`wallet:${w}`,{address:w},await deployedAt(`wallet:${w}`,()=>c.deployedAtBlock()),end);
      for(const log of logs) {const e=iface.parseLog(log);if(e) result.push({blockNumber:log.blockNumber,logIndex:log.index,txHash:log.transactionHash,event:e.name,args:e.args.toObject(true)});}
      return result.reverse();
    },
    createWallet:(c,o)=>write(null,'createWallet',[c],o),deposit:(w,a,o)=>write(w,'deposit',[a],o),
    proposePayment:(w,r,a,o)=>write(w,'proposePayment',[r,a],o),proposeAction:(w,a,p,o)=>write(w,'proposeAction',[a,p],o),
    initiateRecovery:(w,oldA,newA,o)=>write(w,'initiateRecovery',[oldA,newA],o)
  };
  for(const method of ['approve','revokeApproval','voteCancel','execute','approveRecovery','confirmRecovery','cancelRecovery','voteCancelRecovery','executeRecovery']) api[method]=(w,id,o)=>write(w,method,[id],o);
  return api;
}
