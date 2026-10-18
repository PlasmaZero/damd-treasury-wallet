// UI development only. This state stays in memory and never moves real or test-chain ETH.
import {getAddress} from 'ethers';
import {ACTION_NAMES,describeAction,validateConfig} from '../contract/params.js';
import {ERROR_MESSAGES} from '../contract/errors.js';
const address=n=>getAddress(`0x${n.toString(16).padStart(40,'0')}`);
const E=10n**18n;
export const MOCK_WALLET=address(100);
export const MOCK_ACCOUNTS=[{name:'Owner 1',address:address(1)},{name:'Owner 5 · recovery target',address:address(5)},{name:'Guardian 1',address:address(6)},{name:'Guardian 2',address:address(7)},{name:'Owner 2',address:address(2)},{name:'Owner 3',address:address(3)},{name:'New owner',address:address(9)},{name:'Observer',address:address(10)}];
export function createWalletService() {
  let account=null,offset=0,block=1000;const callbacks=new Set(),accountCallbacks=new Set(),known=new Set([MOCK_WALLET]);
  const now=()=>Math.floor(Date.now()/1000)+offset;
  const cfg={owners:[1,2,3,4,5].map(address),threshold:3,guardians:[6,7,8].map(address),guardianThreshold:2,limits:{perTxCap:2n*E,dailyCap:5n*E,smallTierCap:E/2n},delays:{smallTierDelay:15,largeTierDelay:60,governanceDelay:120,recoveryDelay:180,proposalTTL:86400,recoveryTTL:86400}};
  const make=(config,balance=0n)=>({config:structuredClone(config),balance,spent:0n,day:Math.floor(now()/86400),proposals:[],recoveries:[],history:[]});
  const stores=new Map([[MOCK_WALLET,make(cfg,10n*E)]]);
  function err(code){throw Object.assign(new Error(ERROR_MESSAGES[code]??code),{code});}
  function get(w){const d=stores.get(getAddress(w));if(!d)throw Error('Unknown mock wallet.');if(d.day!==Math.floor(now()/86400)){d.day=Math.floor(now()/86400);d.spent=0n;}return d;}
  function status(r){return ['Pending','Queued','Ready'].includes(r.status)&&now()>r.expiresAt?'Expired':r.status==='Queued'&&now()>=r.readyAt?'Ready':r.status;}
  function isActive(r){return ['Pending','Queued','Ready'].includes(status(r));}
  function votes(by,members,needed){const live=by.filter(a=>members.includes(a));return {count:live.length,needed,by:live};}
  function proposalView(d,p){const c=d.config;return {...structuredClone(p),status:status(p),summary:describeAction(p.action,p.params),approvals:votes(p.approvals,c.owners,c.threshold),cancelVotes:votes(p.cancelVotes,c.owners,c.owners.length-c.threshold+1)};}
  function recoveryView(d,r){const c=d.config;return {...structuredClone(r),status:status(r),approvals:votes(r.approvals,c.guardians,c.guardianThreshold),cancelVotes:votes(r.cancelVotes,c.owners.filter(a=>a!==r.oldOwner),c.threshold)};}
  function queue(d,r,recovery=false){const c=d.config;if(r.status!=='Pending')return;const needed=recovery?c.guardianThreshold:c.threshold,members=recovery?c.guardians:c.owners;if(votes(r.approvals,members,needed).count<needed)return;r.status='Queued';r.readyAt=now()+(recovery?c.delays.recoveryDelay:r.action==='Payment'?(r.params.amount<=c.limits.smallTierCap?c.delays.smallTierDelay:c.delays.largeTierDelay):c.delays.governanceDelay);}
  function newMember(d,a){a=getAddress(a);if(a===address(0)||stores.has(a))err('InvalidAddress');if([...d.config.owners,...d.config.guardians].includes(a))err('DuplicateAddress');return a;}
  function governance(d,action,p){const c=d.config;
    if(action==='AddOwner'){if(c.guardians.includes(p.owner))err('RoleOverlap');c.owners.push(newMember(d,p.owner));}
    else if(action==='RemoveOwner'){if(!c.owners.includes(p.owner))err('NotOwner');c.owners=c.owners.filter(a=>a!==p.owner);forget(d,p.owner);}
    else if(action==='ReplaceOwner'){if(!c.owners.includes(p.oldOwner))err('NotOwner');const n=newMember(d,p.newOwner);c.owners=c.owners.map(a=>a===p.oldOwner?n:a);forget(d,p.oldOwner);}
    else if(action==='SetThreshold')c.threshold=Number(p.threshold);
    else if(action==='AddGuardian'){if(c.owners.includes(p.guardian))err('RoleOverlap');c.guardians.push(newMember(d,p.guardian));}
    else if(action==='RemoveGuardian'){if(!c.guardians.includes(p.guardian))err('NotGuardian');c.guardians=c.guardians.filter(a=>a!==p.guardian);forget(d,p.guardian);}
    else if(action==='SetGuardianThreshold')c.guardianThreshold=Number(p.guardianThreshold);
    else if(action==='SetLimits')c.limits={...p};
    else if(action==='SetDelays')c.delays=Object.fromEntries(Object.entries(p).map(([k,v])=>[k,Number(v)]));else err('InvalidAction');
    validateConfig(c);
  }
  function forget(d,a){for(const r of [...d.proposals,...d.recoveries]){r.approvals=r.approvals.filter(v=>v!==a);r.cancelVotes=r.cancelVotes.filter(v=>v!==a);}}
  function transition(d,method,args){
    const c=d.config,owner=c.owners.includes(account),guardian=c.guardians.includes(account);if(!account)throw Error('Connect the mock account first.');
    const payment=(recipient,amount)=>{if(getAddress(recipient)===address(0)||stores.has(recipient))err('InvalidAddress');if(amount<=0n)err('AmountZero');if(amount>c.limits.perTxCap)err('AboveTxCap');};
    if(method==='deposit'){if(args[0]<=0n)err('AmountZero');d.balance+=args[0];return {event:'Deposited',args:{from:account,amount:args[0]}};}
    if(['proposePayment','proposeAction','approve','revokeApproval','voteCancel','execute','voteCancelRecovery'].includes(method)&&!owner)err('NotOwner');
    if(['initiateRecovery','approveRecovery'].includes(method)&&!guardian)err('NotGuardian');
    if(method==='proposePayment'||method==='proposeAction'){
      const action=method==='proposePayment'?'Payment':args[0],params=method==='proposePayment'?{recipient:getAddress(args[0]),amount:args[1]}:args[1];
      if(action==='Payment')payment(params.recipient,params.amount);else governance(structuredClone(d),action,params);
      const id=d.proposals.length,p={id,action,params,proposer:account,createdAt:now(),readyAt:0,expiresAt:now()+c.delays.proposalTTL,status:'Pending',approvals:[account],cancelVotes:[]};d.proposals.push(p);queue(d,p);return {id,event:'ProposalCreated',args:{id,action}};
    }
    if(method==='initiateRecovery'){
      const [oldOwner,raw]=args,newOwner=newMember(d,raw);if(!c.owners.includes(oldOwner))err('NotOwner');if(d.recoveries.some(r=>isActive(r)&&(r.oldOwner===oldOwner||r.newOwner===newOwner)))err('RecoveryAlreadyActive');
      const id=d.recoveries.length,r={id,oldOwner,newOwner,initiator:account,createdAt:now(),readyAt:0,expiresAt:now()+c.delays.recoveryTTL,status:'Pending',newOwnerConfirmed:false,approvals:[account],cancelVotes:[]};d.recoveries.push(r);queue(d,r,true);return {id,event:'RecoveryInitiated',args:{id,oldOwner,newOwner}};
    }
    const recovery=method.includes('Recovery'),r=(recovery?d.recoveries:d.proposals)[Number(args[0])];if(!r)err(recovery?'UnknownRecovery':'UnknownProposal');if(status(r)==='Expired')err('RequestExpired');if(!isActive(r))err('WrongStatus');
    if(method==='approve'||method==='approveRecovery'){if(r.approvals.includes(account))err('AlreadyApproved');r.approvals.push(account);queue(d,r,recovery);}
    else if(method==='revokeApproval'){if(r.status!=='Pending')err('WrongStatus');if(!r.approvals.includes(account))err('NotApproved');r.approvals=r.approvals.filter(a=>a!==account);}
    else if(method==='voteCancel'||method==='voteCancelRecovery'){if(recovery&&account===r.oldOwner)err('NotAuthorized');if(r.cancelVotes.includes(account))err('AlreadyVoted');r.cancelVotes.push(account);if(votes(r.cancelVotes,c.owners,recovery?c.threshold:c.owners.length-c.threshold+1).count>=(recovery?c.threshold:c.owners.length-c.threshold+1))r.status='Cancelled';}
    else if(method==='confirmRecovery'){if(account!==r.newOwner)err('NotAuthorized');if(r.newOwnerConfirmed)err('AlreadyApproved');r.newOwnerConfirmed=true;}
    else if(method==='cancelRecovery'){if(account!==r.oldOwner)err('NotAuthorized');r.status='Cancelled';}
    else if(method==='execute'||method==='executeRecovery'){
      if(recovery&&!guardian&&account!==r.newOwner)err('NotAuthorized');if(r.status!=='Queued')err('WrongStatus');if(now()<r.readyAt)err('TimelockActive');if(votes(r.approvals,recovery?c.guardians:c.owners,recovery?c.guardianThreshold:c.threshold).count<(recovery?c.guardianThreshold:c.threshold))err('BelowThreshold');
      if(recovery){if(!r.newOwnerConfirmed)err('NewOwnerNotConfirmed');governance(d,'ReplaceOwner',{oldOwner:r.oldOwner,newOwner:r.newOwner});}
      else if(r.action==='Payment'){payment(r.params.recipient,r.params.amount);if(d.spent+r.params.amount>c.limits.dailyCap)err('DailyCapExceeded');if(d.balance<r.params.amount)err('InsufficientBalance');d.balance-=r.params.amount;d.spent+=r.params.amount;}
      else governance(d,r.action,r.params);r.status='Executed';
    }else err('InvalidAction');
    return {event:method[0].toUpperCase()+method.slice(1),args:{id:r.id}};
  }
  const d=get(MOCK_WALLET);d.spent=E;
  for(const [id,state]of ['Executed','Cancelled','Expired','Ready','Queued','Pending','Queued'].entries()){
    const action=id===6?'AddOwner':'Payment',params=id===6?{owner:address(11)}:{recipient:address(10),amount:id===4?15n*E/10n:3n*E/10n};
    d.proposals.push({id,action,params,proposer:address(1),createdAt:now()-200,readyAt:id===4?now()+45:id===6?now()+100:id===5?0:now()-10,expiresAt:state==='Expired'?now()-1:now()+86400,status:state==='Ready'?'Queued':state,approvals:id===5?[address(1)]:[1,2,3].map(address),cancelVotes:state==='Cancelled'?[1,2,3].map(address):[]});
  }
  d.recoveries.push({id:0,oldOwner:address(20),newOwner:address(4),initiator:address(6),createdAt:now()-500,readyAt:now()-300,expiresAt:now()+86400,status:'Executed',newOwnerConfirmed:true,approvals:[6,7].map(address),cancelVotes:[]},{id:1,oldOwner:address(5),newOwner:address(9),initiator:address(6),createdAt:now()-10,readyAt:0,expiresAt:now()+86400,status:'Pending',newOwnerConfirmed:false,approvals:[address(6)],cancelVotes:[]});
  let log=0;function record(d,event,args){const txHash=`0x${(++log).toString(16).padStart(64,'0')}`;d.history.unshift({event,args,blockNumber:++block,logIndex:log,txHash});return txHash;}
  for(const p of d.proposals){record(d,'ProposalCreated',{id:p.id,action:p.action,proposer:p.proposer});for(const owner of p.approvals)record(d,'Approved',{id:p.id,owner});if(p.readyAt)record(d,'Queued',{id:p.id,readyAt:p.readyAt});if(['Executed','Cancelled'].includes(p.status))record(d,p.status,{id:p.id});}
  for(const r of d.recoveries){record(d,'RecoveryInitiated',{id:r.id,oldOwner:r.oldOwner,newOwner:r.newOwner});if(r.status==='Executed')record(d,'RecoveryExecuted',{id:r.id});}
  for(let i=0;i<3;i++)record(d,'Deposited',{from:address(i+1),amount:4n*E});
  function notify(){callbacks.forEach(cb=>cb());}
  async function preview(wallet,method,args){try{if(method==='createWallet'){if(!account)throw Error('Connect first.');validateConfig(args[0]);}else transition(structuredClone(get(wallet)),method,args);return {ok:true};}catch(error){return {ok:false,error};}}
  async function write(wallet,method,args,opts={}){
    const result=await preview(wallet,method,args);if(!result.ok)throw result.error;
    const who=account;const hash=`0x${(Date.now()+log).toString(16).padStart(64,'0')}`;opts.onSubmitted?.(hash);await new Promise(r=>setTimeout(r,800));if(who!==account)throw Error('Mock account changed during submission.');
    if(method==='createWallet'){const w=address(100+stores.size);stores.set(w,make(args[0]));known.add(w);record(get(w),'WalletCreated',{wallet:w,creator:account});notify();return {txHash:hash,blockNumber:block,wallet:w};}
    const data=get(wallet),change=transition(data,method,args);record(data,change.event,change.args);data.history[0].txHash=hash;notify();return {txHash:hash,blockNumber:block,...(change.id==null?{}:{id:change.id})};
  }
  const api={connect:async()=>{account??=address(1);accountCallbacks.forEach(cb=>cb());notify();return account;},getAccount:()=>account,onAccountOrChainChange:cb=>{accountCallbacks.add(cb);return()=>accountCallbacks.delete(cb);},addKnownWallet:w=>{get(w);known.add(getAddress(w));},listWallets:async()=>[...known],
    snapshot:async w=>{const data=get(w),c=structuredClone(data.config),r=data.recoveries.find(r=>r.oldOwner===account&&isActive(r));return {address:w,balance:data.balance,chainTime:now(),blockNumber:block,config:c,cancelThreshold:c.owners.length-c.threshold+1,spentToday:data.spent,remainingToday:data.spent>=c.limits.dailyCap?0n:c.limits.dailyCap-data.spent,proposalCount:data.proposals.length,recoveryCount:data.recoveries.length,me:{account,roles:{isOwner:c.owners.includes(account),isGuardian:c.guardians.includes(account)},activeRecoveryAgainstMe:r?.id??null}};},
    listProposals:async(w,{offset=0,limit=50}={})=>{const d=get(w);return d.proposals.slice().reverse().slice(offset,offset+limit).map(p=>proposalView(d,p));},getProposal:async(w,id)=>proposalView(get(w),get(w).proposals[id]),
    listRecoveries:async(w,{offset=0,limit=50}={})=>{const d=get(w);return d.recoveries.slice().reverse().slice(offset,offset+limit).map(r=>recoveryView(d,r));},getRecovery:async(w,id)=>recoveryView(get(w),get(w).recoveries[id]),getHistory:async w=>structuredClone(get(w).history),preview,
    subscribe:(_w,cb)=>{callbacks.add(cb);const timer=setInterval(cb,2000);return()=>{callbacks.delete(cb);clearInterval(timer);};},
    createWallet:(c,o)=>write(null,'createWallet',[c],o),deposit:(w,a,o)=>write(w,'deposit',[a],o),proposePayment:(w,r,a,o)=>write(w,'proposePayment',[r,a],o),proposeAction:(w,a,p,o)=>{if(!ACTION_NAMES.includes(a)||a==='Payment')return Promise.reject(Error('Invalid governance action'));return write(w,'proposeAction',[a,p],o);},initiateRecovery:(w,a,b,o)=>write(w,'initiateRecovery',[a,b],o),
    mock:{setAccount:a=>{account=getAddress(a);accountCallbacks.forEach(cb=>cb());notify();},advanceTime:s=>{offset+=s;block++;notify();},accounts:MOCK_ACCOUNTS}
  };
  for(const method of ['approve','revokeApproval','voteCancel','execute','approveRecovery','confirmRecovery','cancelRecovery','voteCancelRecovery','executeRecovery'])api[method]=(w,id,o)=>write(w,method,[id],o);
  return api;
}
