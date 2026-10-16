import {useCallback,useEffect,useRef,useState,useId,cloneElement} from 'react';
import {createWalletService,MOCK_WALLET,MOCK_ACCOUNTS} from './services/index.js';
import {ACTION_NAMES,FIELDS,eth,short,parseAddresses,parseAmount,validateConfig,describeAction} from './contract/params.js';

const MOCK=import.meta.env.VITE_USE_MOCK==='true';
const CHAIN=Number(import.meta.env.VITE_CHAIN_ID??1337);
const RPC=import.meta.env.VITE_RPC_URL??(CHAIN===1337?'http://127.0.0.1:8545':'');
const EXPLORER=CHAIN===11155111?'https://sepolia.etherscan.io':null;
const DELAYS={smallTierDelay:15,largeTierDelay:60,governanceDelay:120,recoveryDelay:180,proposalTTL:86400,recoveryTTL:86400};
const human=s=>s.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const active=s=>['Pending','Queued','Ready'].includes(s);
const same=(a,b)=>a?.toLowerCase()===b?.toLowerCase();
const date=n=>new Date(n*1000).toLocaleString();
function Address({value}) {return <span className="address" title={value}>{value??'Not connected'}</span>;}
function Field({label,children,hint}) {const id=useId();return <div className="field"><label htmlFor={id}>{label}</label>{cloneElement(children,{id})}{hint&&<small>{hint}</small>}</div>;}
function Notice({children,type=''}) {return <div className={`notice ${type}`}>{children}</div>;}
function Badge({status}) {return <span className={`badge ${status.toLowerCase()}`}>{status}</span>;}
function TxLink({hash}) {return EXPLORER?<a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>:<span className="address" title={hash}>{short(hash)}</span>;}
function ActionButton({children,reason,busy,onClick}) {return <span className="action-wrap"><button type="button" disabled={busy||!!reason} onClick={onClick} title={reason??''}>{children}</button>{reason&&<small>{reason}</small>}</span>;}

export default function App() {
  const [service,setService]=useState(null),[setupError,setSetupError]=useState(''),[retry,setRetry]=useState(0);
  const [account,setAccount]=useState(null),[wallet,setWallet]=useState(''),[wallets,setWallets]=useState([]);
  const [snap,setSnap]=useState(null),[proposals,setProposals]=useState([]),[recoveries,setRecoveries]=useState([]),[history,setHistory]=useState([]);
  const [tab,setTab]=useState('Overview'),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [status,setStatus]=useState(null),[review,setReview]=useState(null),[manual,setManual]=useState('');
  const [page,setPage]=useState(0),[recoveryPage,setRecoveryPage]=useState(0);
  const generation=useRef(0),loadingRef=useRef(false),reloadRef=useRef(false);
  useEffect(()=>{let live=true;
    (async()=>{
      try {
        const response=MOCK?{ok:true,json:async()=>({chainId:1337,factory:MOCK_WALLET,demoWallet:MOCK_WALLET})}:await fetch(`/deployments/${CHAIN}.json`,{cache:'no-store'});
        if(!response.ok) throw Error('Deployment file is missing. Start the chain and run npm run deploy.');
        const d=await response.json();if(!d.factory) throw Error('Factory has not been deployed. Run npm run deploy.');
        if(!RPC) throw Error('Set VITE_RPC_URL in .env for this network.');
        const s=createWalletService({...d,rpcUrl:RPC});if(d.demoWallet)s.addKnownWallet(d.demoWallet);
        if(live){setService(s);setWallet(d.demoWallet??'');setWallets(d.demoWallet?[d.demoWallet]:[]);setSetupError('');}
      } catch(e){if(live)setSetupError(e.message);}
    })(); return ()=>{live=false;};
  },[retry]);
  useEffect(()=>{if(!service)return;return service.onAccountOrChainChange(()=>{generation.current++;setAccount(service.getAccount());setReview(null);setSnap(null);setProposals([]);setRecoveries([]);});},[service]);
  useEffect(()=>{generation.current++;setSnap(null);setProposals([]);setRecoveries([]);setHistory([]);setReview(null);},[wallet,account]);
  useEffect(()=>{if(!service)return;let current=true;service.listWallets(account).then(list=>{if(current)setWallets(list);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[service,account,wallet]);
  const refresh=useCallback(async()=>{
    if(!service||!wallet)return;
    if(loadingRef.current){reloadRef.current=true;return;}
    loadingRef.current=true;setLoading(true);const token=generation.current;
    try {
      const s=await service.snapshot(wallet);
      const p=await service.listProposals(wallet,{offset:page*10,limit:10});
      const r=await service.listRecoveries(wallet,{offset:recoveryPage*10,limit:10});
      if(token===generation.current){setSnap(s);setProposals(p);setRecoveries(r);setError('');}
    }catch(e){if(token===generation.current){setError(e.message);setSnap(null);}}
    finally{loadingRef.current=false;setLoading(false);}
  },[service,wallet,page,recoveryPage]);
  useEffect(()=>{refresh();if(!service||!wallet)return;return service.subscribe(wallet,refresh);},[service,wallet,account,refresh]);
  useEffect(()=>{const timer=setInterval(()=>{if(reloadRef.current&&!loadingRef.current){reloadRef.current=false;refresh();}},300);return()=>clearInterval(timer);},[refresh]);
  useEffect(()=>{if(!service||!wallet||tab!=='Activity')return;let current=true;service.getHistory(wallet).then(h=>{if(current)setHistory(h);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[service,wallet,tab,snap?.blockNumber]);
  async function connect(){try{setBusy(true);setError('');setAccount(await service.connect());}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function prepare(method,args,summary){
    const token=generation.current;setBusy(true);setError('');
    try{const result=await service.preview(wallet,method,args);if(token!==generation.current)return;setReview({method,args,summary,result,wallet,account});}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function submit(){
    if(!review?.result.ok)return;
    if(review.wallet!==wallet||review.account!==account){setReview(null);setError('Account or wallet changed. Review again.');return;}
    const r=review;setReview(null);setBusy(true);setStatus({state:'signing',text:'Confirm the transaction in MetaMask.'});
    try {
      const opts={onSubmitted:hash=>setStatus({state:'pending',text:'Submitted. Waiting for confirmation…',hash})};
      const result=r.method==='createWallet'?await service.createWallet(r.args[0],opts):await service[r.method](r.wallet,...r.args,opts);
      setStatus({state:'success',text:'Transaction confirmed.',hash:result.txHash});
      if(result.wallet){setWallet(result.wallet);setTab('Overview');}else await refresh();
    }catch(e){setStatus({state:'error',text:e.message,details:e.details});}finally{setBusy(false);}
  }
  const owner=snap?.me.roles.isOwner,guardian=snap?.me.roles.isGuardian;
  const role=owner?'Owner':guardian?'Guardian':account?'Observer':'Read only';
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">D</span><div>DAMD<span>Shared treasury</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{['Overview','Proposals','Governance','Recovery','Activity','Create wallet'].map((t,i)=><button key={t} className={tab===t?'nav-item selected':'nav-item'} onClick={()=>setTab(t)}><span className="nav-number">0{i+1}</span>{t}</button>)}</nav>
      <div className="sidebar-bottom"><span className="dot"/> {CHAIN===1337?'Local development':'Sepolia testnet'}<p>Test ETH only<br/>No private keys stored by this app.</p></div>
    </aside>
    <main>
      <header className="topbar"><span>TEAM DAMD <span className="slash">/</span> Treasury workspace</span><div className="account-area"><span className="role">{role}</span>{account&&<span title={account}>{short(account)}</span>}<button className="primary" onClick={connect} disabled={!service||busy}>{account?'Reconnect wallet':'Connect MetaMask'}</button></div></header>
      <div className="content"><div className="page-heading"><div className="eyebrow">CONTROL TOGETHER</div><h1>{tab}</h1><p>{({Overview:'A clear view of your funds and the rules that protect them.',Proposals:'Review shared decisions. Approve, wait, then execute.',Governance:'Change wallet rules through the same approval process.',Recovery:'Replace a lost owner address with guardian approval.',Activity:'An on-chain record of your treasury’s actions.','Create wallet':'Set the members and rules for a new shared treasury.'})[tab]}</p></div>
      {setupError&&<Notice type="error"><strong>Setup required</strong><p>{setupError}</p><code>npm run chain</code><p>In another terminal: <code>npm run deploy</code></p><button onClick={()=>setRetry(x=>x+1)}>Retry setup</button></Notice>}
      {service?.mock&&<Notice><strong>SIMULATED DATA — no blockchain transactions</strong><div className="button-row"><select aria-label="Mock account" value={account??''} onChange={e=>service.mock.setAccount(e.target.value)}><option value="" disabled>Select a demo role</option>{MOCK_ACCOUNTS.map(a=><option key={a.address} value={a.address}>{a.name}</option>)}</select><button onClick={()=>service.mock.advanceTime(60)}>Advance 60 seconds</button></div></Notice>}{service&&<div className="wallet-bar"><Field label="Treasury wallet"><select value={wallet} onChange={e=>{setWallet(e.target.value);setPage(0);setRecoveryPage(0);}}><option value="">Select a wallet</option>{wallets.map(w=><option key={w} value={w}>{short(w)}{same(w,wallet)?' · selected':''}</option>)}</select></Field><form className="inline-form" onSubmit={e=>{e.preventDefault();try{service.addKnownWallet(manual);setWallet(manual);setManual('');setPage(0);setRecoveryPage(0);}catch{setError('Enter a valid Ethereum wallet contract address.');}}}><Field label="Add wallet by address"><input aria-label="Wallet contract address" value={manual} placeholder="0x…" onChange={e=>setManual(e.target.value)} required/></Field><button type="submit">Add</button></form><button onClick={refresh} disabled={loading||!wallet}>{loading?'Syncing…':'Refresh'}</button></div>}
      {wallet&&<div className="wallet-address"><Address value={wallet}/>{snap&&<span>Block {snap.blockNumber.toLocaleString()} · {date(snap.chainTime)}</span>}</div>}
      {error&&<Notice type="error">{error}</Notice>}
      {status&&<Notice type={status.state}><div className="notice-row"><strong>{status.text}</strong>{!busy&&<button onClick={()=>setStatus(null)} aria-label="Dismiss transaction status">×</button>}</div>{status.hash&&<TxLink hash={status.hash}/>} {status.details&&<details><summary>Technical detail</summary><pre>{status.details}</pre></details>}</Notice>}
      {snap?.me.activeRecoveryAgainstMe!=null&&<Notice type="error"><strong>A recovery targets your owner address.</strong><p>If you still control this account, cancel recovery #{snap.me.activeRecoveryAgainstMe}.</p><button disabled={busy} onClick={()=>prepare('cancelRecovery',[snap.me.activeRecoveryAgainstMe],'Cancel the recovery targeting your address')}>Review cancellation</button></Notice>}
      {!account&&service&&<Notice>Connect MetaMask to propose, approve, deposit, or recover. Public wallet data is available without signing.</Notice>}
      {tab==='Create wallet'&&<CreateWallet busy={busy||!account} prepare={prepare} onError={setError}/>}
      {!snap&&tab!=='Create wallet'&&!setupError&&<div className="empty">{loading?'Reading wallet state…':'Select a deployed wallet to view its treasury.'}</div>}
      {snap&&tab==='Overview'&&<Overview snap={snap} busy={busy||!account} prepare={prepare} onError={setError}/>}
      {snap&&tab==='Proposals'&&<><PaymentForm snap={snap} busy={busy} prepare={prepare} onError={setError}/><ProposalList proposals={proposals} snap={snap} busy={busy} prepare={prepare} service={service} wallet={wallet}/><Pager page={page} setPage={setPage} total={snap.proposalCount}/></>}
      {snap&&tab==='Governance'&&<Governance snap={snap} busy={busy||!owner} prepare={prepare} onError={setError}/>}
      {snap&&tab==='Recovery'&&<><RecoveryForm snap={snap} busy={busy||!guardian} prepare={prepare} onError={setError}/>{recoveries.length?recoveries.map(r=><RecoveryCard key={r.id} r={r} snap={snap} busy={busy} prepare={prepare}/>):<div className="empty">No recovery requests yet.</div>}<Pager page={recoveryPage} setPage={setRecoveryPage} total={snap.recoveryCount}/></>}
      {snap&&tab==='Activity'&&<History items={history}/>}
      <footer>Immutable contracts · ETH only · {CHAIN===1337?'Local chain 1337':'Sepolia chain 11155111'}<span>Course MVP · Not audited for real funds</span></footer>
      </div>
    </main>
    {review&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="eyebrow">BEFORE YOU SIGN</div><h2 id="review-title">Review transaction</h2><p>{review.summary}</p><div className="detail-line"><span>Signing account</span><Address value={account}/></div>{review.method!=='createWallet'&&<div className="detail-line"><span>Treasury</span><Address value={wallet}/></div>}<pre>{json(review.args)}</pre><Notice type={review.result.ok?'success':'error'}>{review.result.ok?'Simulation passed. The contract will check the rules again when the transaction executes.':review.result.error.message}</Notice><div className="button-row"><button onClick={()=>setReview(null)}>Back</button><button className="primary" disabled={!review.result.ok||busy} onClick={submit}>Confirm in MetaMask</button></div></section></div>}
  </div>;
}
function Pager({page,setPage,total}) {return <div className="pager"><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} · {total} total</span><button disabled={(page+1)*10>=total} onClick={()=>setPage(p=>p+1)}>Next</button></div>;}
function Overview({snap,busy,prepare,onError}) {
  const [amount,setAmount]=useState('0.1'),c=snap.config;
  return <><div className="stats"><div className="stat hero"><span>TREASURY BALANCE</span><strong>{eth(snap.balance)} <small>ETH</small></strong><p>Held by the shared contract</p></div><div className="stat"><span>AVAILABLE TODAY</span><strong>{eth(snap.remainingToday)} <small>ETH</small></strong><p>{eth(snap.spentToday)} of {eth(c.limits.dailyCap)} ETH spent · UTC day</p></div><div className="stat"><span>OWNER APPROVALS</span><strong>{c.threshold}<small> of {c.owners.length}</small></strong><p>{snap.cancelThreshold} votes to cancel a proposal</p></div></div>
    <div className="two-col"><section className="panel"><h2>Add test funds</h2><p>Anyone can deposit. Payments out require owner approvals and a timelock.</p><form onSubmit={e=>{e.preventDefault();try{prepare('deposit',[parseAmount(amount)],`Deposit ${amount} ETH into the treasury`);}catch(e){onError(e.message);}}}><Field label="Deposit amount (ETH)"><input value={amount} inputMode="decimal" onChange={e=>setAmount(e.target.value)} required/></Field><button className="primary" disabled={busy}>Review deposit</button></form></section><section className="panel"><h2>Payment rules</h2><dl><dt>Per-payment limit</dt><dd>{eth(c.limits.perTxCap)} ETH</dd><dt>Small payment tier</dt><dd>≤ {eth(c.limits.smallTierCap)} ETH · {c.delays.smallTierDelay}s</dd><dt>Large payment delay</dt><dd>{c.delays.largeTierDelay}s</dd><dt>Governance delay</dt><dd>{c.delays.governanceDelay}s</dd><dt>Recovery delay</dt><dd>{c.delays.recoveryDelay}s</dd><dt>Proposal / recovery expiry</dt><dd>{c.delays.proposalTTL}s / {c.delays.recoveryTTL}s</dd></dl><small>Timelocks start when approval quorum is reached.</small></section></div>
    <div className="two-col">{[['Owners',c.owners,`${c.threshold} approvals required`],['Guardians',c.guardians,`${c.guardianThreshold} approvals for recovery`]].map(([title,list,subtitle])=><section className="panel" key={title}><h2>{title}</h2><p>{subtitle}</p><ul className="members">{list.map(a=><li key={a}><Address value={a}/>{same(a,snap.me.account)&&<span className="role">You</span>}</li>)}</ul></section>)}</div></>;
}
function PaymentForm({snap,busy,prepare,onError}) {
  const [recipient,setRecipient]=useState(''),[amount,setAmount]=useState('0.1');let parsed=0n;try{parsed=parseAmount(amount);}catch{/* shown on submit */}
  const c=snap.config,delay=parsed<=c.limits.smallTierCap?c.delays.smallTierDelay:c.delays.largeTierDelay;
  return <section className="panel"><h2>New payment</h2><p>The proposer’s approval counts automatically. Execution is a separate transaction after the delay.</p><form onSubmit={e=>{e.preventDefault();try{const [a]=parseAddresses(recipient);if(!a)throw Error('Enter a recipient address.');prepare('proposePayment',[a,parseAmount(amount)],`Propose ${amount} ETH to ${a}`);}catch(e){onError(e.message);}}}><div className="form-grid"><Field label="Recipient address"><input placeholder="0x…" value={recipient} onChange={e=>setRecipient(e.target.value)} required/></Field><Field label="Amount (ETH)"><input value={amount} onChange={e=>setAmount(e.target.value)} required inputMode="decimal"/></Field></div><div className="hint-row"><span>Delay after quorum: <strong>{delay}s</strong></span><span>Per-payment cap: {eth(c.limits.perTxCap)} ETH</span><span>Remaining today: {eth(snap.remainingToday)} ETH</span></div>{parsed>c.limits.perTxCap&&<Notice type="error">Amount exceeds the per-payment cap.</Notice>}{parsed>snap.remainingToday&&<Notice>Not enough daily allowance to execute today. A proposal can still be created.</Notice>}<button className="primary" disabled={busy||!snap.me.roles.isOwner||parsed>c.limits.perTxCap}>Review payment proposal</button>{!snap.me.roles.isOwner&&<small>Only owners can propose payments.</small>}</form></section>;
}
function ProposalList({proposals,snap,busy,prepare,service,wallet}) {
  const [filter,setFilter]=useState('All');
  const list=filter==='All'?proposals:proposals.filter(p=>p.status===filter);
  return <><div className="section-heading"><h2>Proposal queue</h2><select aria-label="Filter proposals on this page" value={filter} onChange={e=>setFilter(e.target.value)}>{['All','Pending','Queued','Ready','Executed','Cancelled','Expired'].map(s=><option key={s}>{s}</option>)}</select></div><small>Filter applies to the current page.</small>{list.length?list.map(p=><ProposalCard key={p.id} p={p} snap={snap} busy={busy} prepare={prepare} service={service} wallet={wallet}/>):<div className="empty">No proposals match this page.</div>}</>;
}
function ProposalCard({p,snap,busy,prepare,service,wallet}) {
  const [timeline,setTimeline]=useState(null),[timelineError,setTimelineError]=useState('');
  const who=snap.me.account,owner=snap.me.roles.isOwner,allowed=active(p.status),approved=p.approvals.by.some(a=>same(a,who)),voted=p.cancelVotes.by.some(a=>same(a,who));
  const base=!owner?'Owners only':!allowed?`Request is ${p.status.toLowerCase()}`:null;
  const run=method=>prepare(method,[p.id],`${human(method)} proposal #${p.id}: ${p.summary}`);
  return <article className="panel proposal"><div className="card-heading"><div><div className="eyebrow">PROPOSAL #{p.id} · {human(p.action)}</div><h3>{p.summary}</h3></div><Badge status={p.status}/></div><div className="metrics"><span><strong>{p.approvals.count}/{p.approvals.needed}</strong> approvals</span><span><strong>{p.cancelVotes.count}/{p.cancelVotes.needed}</strong> cancel votes</span><span>{p.status==='Queued'?`${Math.max(0,p.readyAt-snap.chainTime)}s until ready`:p.readyAt?`Unlock: ${date(p.readyAt)}`:'Waiting for quorum'}</span></div><div className="button-row"><ActionButton busy={busy} reason={base||(approved?'Already approved':null)} onClick={()=>run('approve')}>Approve</ActionButton><ActionButton busy={busy} reason={base||(p.status!=='Pending'?'Pending only':!approved?'No approval to revoke':null)} onClick={()=>run('revokeApproval')}>Revoke</ActionButton><ActionButton busy={busy} reason={base||(voted?'Already voted':null)} onClick={()=>run('voteCancel')}>Vote to cancel</ActionButton><ActionButton busy={busy} reason={base||(p.status!=='Ready'?'Waiting for quorum or timelock':p.approvals.count<p.approvals.needed?'Below approval threshold':null)} onClick={()=>run('execute')}>Execute</ActionButton></div><details><summary>Members, parameters & timeline</summary><p>Created {date(p.createdAt)} · Expires {date(p.expiresAt)}</p><Address value={p.proposer}/><pre>{json(p.params)}</pre><ul className="members">{snap.config.owners.map(a=><li key={a}><Address value={a}/><span>{p.approvals.by.includes(a)?'Approved':'Not approved'}{p.cancelVotes.by.includes(a)?' · Cancel vote':''}</span></li>)}</ul><button onClick={async()=>{try{const h=await service.getHistory(wallet);setTimeline(h.filter(e=>e.args.id!=null&&Number(e.args.id)===p.id&&!e.event.startsWith('Recovery')));}catch(e){setTimelineError(e.message);}}}>Load proposal timeline</button>{timelineError&&<p>{timelineError}</p>}{timeline&&<History items={timeline}/>}</details></article>;
}
function Governance({snap,busy,prepare,onError}) {
  const [action,setAction]=useState('AddOwner'),[values,setValues]=useState({});
  return <section className="panel"><h2>Propose a rule change</h2><p>Requires {snap.config.threshold} owner approvals and the current {snap.config.delays.governanceDelay}s governance delay. For a compromised owner key, use Replace Owner.</p><form onSubmit={e=>{e.preventDefault();try{const p={};for(const k of FIELDS[action]){if(['perTxCap','dailyCap','smallTierCap'].includes(k))p[k]=parseAmount(values[k]);else if(/owner|guardian/i.test(k)&&!k.includes('Threshold')){const [a]=parseAddresses(values[k]??'');if(!a)throw Error('Enter an address.');p[k]=a;}else{if(!/^\d+$/.test(values[k]??''))throw Error('Use whole nonnegative numbers.');p[k]=BigInt(values[k]);}}prepare('proposeAction',[action,p],describeAction(action,p));}catch(e){onError(e.message);}}}><Field label="Action"><select value={action} onChange={e=>{setAction(e.target.value);setValues({});}}>{ACTION_NAMES.slice(1).map(a=><option value={a} key={a}>{human(a)}</option>)}</select></Field><div className="form-grid">{FIELDS[action].map(k=><Field key={k} label={`${human(k)}${action==='SetLimits'?' (ETH)':action==='SetDelays'?' (seconds)':''}`}><input required value={values[k]??''} onChange={e=>setValues(v=>({...v,[k]:e.target.value}))}/></Field>)}</div><button className="primary" disabled={busy}>Review governance proposal</button>{!snap.me.roles.isOwner&&<small>Only owners can propose governance changes.</small>}</form></section>;
}
function RecoveryForm({snap,busy,prepare,onError}) {
  const [oldOwner,setOld]=useState(''),[newOwner,setNew]=useState('');
  return <section className="panel"><h2>Recover a lost owner account</h2><p>Guardians propose a replacement address. It needs {snap.config.guardianThreshold} guardian approvals, a {snap.config.delays.recoveryDelay}s delay, and confirmation from the new account. The old owner or {snap.config.threshold} other owners can cancel.</p><Notice>Lost key: use guardian recovery. Stolen or compromised key: owners should propose Replace Owner under Governance. The app never recovers or asks for private keys.</Notice><form onSubmit={e=>{e.preventDefault();try{const [a]=parseAddresses(newOwner);if(!a||!oldOwner)throw Error('Choose the old owner and enter the replacement address.');prepare('initiateRecovery',[oldOwner,a],`Replace lost owner ${oldOwner} with ${a}`);}catch(e){onError(e.message);}}}><div className="form-grid"><Field label="Lost owner address"><select value={oldOwner} onChange={e=>setOld(e.target.value)} required><option value="">Select owner</option>{snap.config.owners.map(a=><option key={a}>{a}</option>)}</select></Field><Field label="New owner address"><input value={newOwner} onChange={e=>setNew(e.target.value)} placeholder="0x…" required/></Field></div><button className="primary" disabled={busy}>Review recovery request</button>{!snap.me.roles.isGuardian&&<small>Only guardians can initiate recovery.</small>}</form></section>;
}
function RecoveryCard({r,snap,busy,prepare}) {
  const who=snap.me.account,owner=snap.me.roles.isOwner,guardian=snap.me.roles.isGuardian,old=same(who,r.oldOwner),replacement=same(who,r.newOwner);
  const base=!active(r.status)?`Request is ${r.status.toLowerCase()}`:null;
  const run=method=>prepare(method,[r.id],`${human(method)} #${r.id}: ${r.oldOwner} → ${r.newOwner}`);
  return <article className="panel"><div className="card-heading"><h3>Recovery #{r.id}</h3><Badge status={r.status}/></div><div className="recovery-addresses"><Address value={r.oldOwner}/><span>→</span><Address value={r.newOwner}/></div><div className="metrics"><span>{r.approvals.count}/{r.approvals.needed} guardian approvals</span><span>{r.cancelVotes.count}/{r.cancelVotes.needed} owner cancel votes</span><span>{r.newOwnerConfirmed?'New owner confirmed':'New owner must confirm'}</span></div><p>{r.readyAt?`Unlock: ${date(r.readyAt)}`:'Waiting for guardian quorum'} · Expires {date(r.expiresAt)}</p><div className="button-row"><ActionButton busy={busy} reason={base||(!guardian?'Guardians only':r.approvals.by.includes(who)?'Already approved':null)} onClick={()=>run('approveRecovery')}>Approve</ActionButton><ActionButton busy={busy} reason={base||(!replacement?'New owner only':r.newOwnerConfirmed?'Already confirmed':null)} onClick={()=>run('confirmRecovery')}>Confirm new account</ActionButton><ActionButton busy={busy} reason={base||(!old?'Old owner only':null)} onClick={()=>run('cancelRecovery')}>Cancel directly</ActionButton><ActionButton busy={busy} reason={base||(!owner||old?'Other owners only':r.cancelVotes.by.includes(who)?'Already voted':null)} onClick={()=>run('voteCancelRecovery')}>Vote to cancel</ActionButton><ActionButton busy={busy} reason={base||(!guardian&&!replacement?'Guardian or new owner only':r.status!=='Ready'?'Waiting for quorum or timelock':r.approvals.count<r.approvals.needed?'Below guardian threshold':!r.newOwnerConfirmed?'New owner must confirm':null)} onClick={()=>run('executeRecovery')}>Execute recovery</ActionButton></div><details><summary>Approval details</summary><p>Guardians who approved:</p>{r.approvals.by.map(a=><p key={a}><Address value={a}/></p>)}<p>Owners who voted to cancel:</p>{r.cancelVotes.by.map(a=><p key={a}><Address value={a}/></p>)}</details></article>;
}
function CreateWallet({busy,prepare,onError}) {
  const [values,setValues]=useState({owners:'',guardians:'',threshold:'3',guardianThreshold:'2',perTxCap:'2',dailyCap:'5',smallTierCap:'0.5',...DELAYS});
  function field(k,label,hint){return <Field key={k} label={label??human(k)} hint={hint}><input value={values[k]} onChange={e=>setValues(v=>({...v,[k]:e.target.value}))} required/></Field>;}
  return <section className="panel"><h2>New shared treasury</h2><p>Each wallet is an independent contract. The creator has no special admin privileges.</p><form onSubmit={e=>{e.preventDefault();try{const c=validateConfig({owners:parseAddresses(values.owners),guardians:parseAddresses(values.guardians),threshold:Number(values.threshold),guardianThreshold:Number(values.guardianThreshold),limits:Object.fromEntries(['perTxCap','dailyCap','smallTierCap'].map(k=>[k,parseAmount(values[k])])),delays:Object.fromEntries(Object.keys(DELAYS).map(k=>[k,Number(values[k])]))});prepare('createWallet',[c],`Create a ${c.threshold}-of-${c.owners.length} wallet with ${c.guardianThreshold}-of-${c.guardians.length} guardian recovery`);}catch(e){onError(e.message);}}}>{['owners','guardians'].map(k=><Field key={k} label={human(k)} hint="Separate addresses with commas or new lines. Roles must not overlap."><textarea rows={3} value={values[k]} onChange={e=>setValues(v=>({...v,[k]:e.target.value}))} required/></Field>)}<div className="form-grid">{field('threshold','Owner threshold')}{field('guardianThreshold','Guardian threshold')}</div><h3>Spending limits</h3><div className="form-grid">{['perTxCap','dailyCap','smallTierCap'].map(k=>field(k,`${human(k)} (ETH)`))}</div><h3>Timelocks & expiry</h3><p>Demo defaults use short delays. Governance and recovery must be at least 60 seconds.</p><div className="form-grid">{Object.keys(DELAYS).map(k=>field(k,`${human(k)} (seconds)`))}</div><button className="primary" disabled={busy}>Review wallet creation</button></form></section>;
}
function History({items}) {return <section className="panel"><h2>Event history</h2>{items.length?<div className="history-list">{items.map(h=><details key={`${h.txHash}:${h.logIndex}`}><summary><span><strong>{human(h.event)}</strong><small>Block {h.blockNumber}</small></span><TxLink hash={h.txHash}/></summary><pre>{json(h.args)}</pre></details>)}</div>:<p>No events loaded yet.</p>}</section>;}
