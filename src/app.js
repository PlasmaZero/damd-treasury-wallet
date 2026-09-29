import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {createService} from './walletService.js';
import './style.css';
const h=React.createElement;
const short=a=>a?`${a.slice(0,8)}...${a.slice(-6)}`:'Not connected';
function App(){
  const [service,setService]=useState(null),[data,setData]=useState(null),[account,setAccount]=useState('');
  const [status,setStatus]=useState('Loading local treasury...'),[busy,setBusy]=useState(false);
  const [recipient,setRecipient]=useState(''),[amount,setAmount]=useState('0.1'),[deposit,setDeposit]=useState('1');
  useEffect(()=>{
    let alive=true,timer;
    createService().then(async s=>{
      if(!alive)return;
      setService(s);setRecipient(s.config.recipient);
      const refresh=async()=>{try{const d=await s.snapshot();if(alive)setData(d);}catch(e){if(alive)setStatus(e.message);}};
      await refresh();if(alive){setStatus('Local treasury ready');timer=setInterval(refresh,4000);}
    }).catch(e=>{if(alive)setStatus(e.message);});
    const reset=()=>{setAccount('');setStatus('Wallet changed. Connect again before signing.');};
    window.ethereum?.on('accountsChanged',reset);window.ethereum?.on('chainChanged',reset);
    return()=>{alive=false;clearInterval(timer);window.ethereum?.removeListener('accountsChanged',reset);window.ethereum?.removeListener('chainChanged',reset);};
  },[]);
  async function action(label,fn){
    setBusy(true);setStatus(`${label}: waiting for wallet approval...`);
    try{const tx=await fn();setStatus(`${label}: submitted ${tx.hash}. Waiting for confirmation...`);const receipt=await tx.wait();if(receipt.status!==1)throw new Error('Transaction reverted');setData(await service.snapshot());setStatus(`${label}: confirmed in block ${receipt.blockNumber}`);}
    catch(e){setStatus(`${label} failed: ${e.shortMessage||e.message}`);}finally{setBusy(false);}
  }
  async function connect(){setBusy(true);try{setAccount(await service.connect());setStatus('Wallet connected');}catch(e){setStatus(e.shortMessage||e.message);}finally{setBusy(false);}}
  const owner=service?.config.owners.some(a=>a.toLowerCase()===account.toLowerCase());
  const field=(label,value,update)=>h('label',null,label,h('input',{value,onChange:e=>update(e.target.value),required:true}));
  return h('main',null,
    h('header',null,h('div',null,h('p',{className:'eyebrow'},'DAMD / CSE 416 / MILESTONE 2'),h('h1',null,'Shared treasury'),h('p',null,'Local blockchain prototype. Test funds only.')),
      h('button',{disabled:busy||!service,onClick:connect},account?short(account):'Connect MetaMask')),
    h('p',{className:'status',role:'status','aria-live':'polite'},status),
    data&&h(React.Fragment,null,
      h('section',{className:'metrics'},...[[data.balance+' ETH','Treasury balance'],[data.threshold+' of 3','Required approvals'],[data.limit+' ETH','Per-payment limit'],[data.delay+' sec','Delay after threshold']].map(([v,l])=>h('div',{key:l},h('strong',null,v),h('span',null,l)))),
      h('p',{className:'address'},'Contract: '+service.config.address),
      h('p',null,'Connected role: '+(account?(owner?'Owner':'Viewer / depositor'):'Read only')),
      h('section',{className:'forms'},
        h('form',{onSubmit:e=>{e.preventDefault();action('Deposit',()=>service.deposit(deposit));}},h('h2',null,'Deposit test ETH'),field('Amount (ETH)',deposit,setDeposit),h('button',{disabled:busy||!account},'Deposit')),
        h('form',{onSubmit:e=>{e.preventDefault();action('Propose payment',()=>service.propose(recipient,amount));}},h('h2',null,'Propose a payment'),field('Recipient address',recipient,setRecipient),field('Amount (ETH)',amount,setAmount),h('button',{disabled:busy||!owner},'Create proposal'))),
      h('section',null,h('h2',null,'Payments and approval history'),data.payments.length===0?h('p',null,'No payment proposals yet.'):h('div',{className:'tablewrap'},h('table',null,
        h('thead',null,h('tr',null,...['ID / recipient','Amount','Approvals','State','Actions'].map(x=>h('th',{key:x},x)))),
        h('tbody',null,...data.payments.map(p=>{
          const state=p.executed?'Executed':p.approvals<data.threshold?'Awaiting approvals':data.timestamp<p.readyAt?'Timelocked':'Ready';
          const voted=p.approvers.some(a=>a.toLowerCase()===account.toLowerCase());
          return h('tr',{key:p.id},h('td',{title:p.recipient},'#'+p.id+' / '+short(p.recipient)),h('td',null,p.amount+' ETH'),h('td',{title:p.approvers.join('\n')||'No approvals'},p.approvals+' / '+data.threshold),h('td',null,state,p.readyAt>0&&!p.executed&&h('small',null,'Unlock: '+new Date(p.readyAt*1000).toLocaleTimeString())),h('td',null,h('button',{disabled:busy||!owner||voted||p.executed,onClick:()=>action('Approve',()=>service.approve(p.id))},voted?'Approved':'Approve'),h('button',{disabled:busy||!owner||state!=='Ready',onClick:()=>action('Execute',()=>service.execute(p.id))},'Execute')));
        }))))),
      h('section',{className:'muted'},h('h2',null,'Social recovery'),h('p',null,'Design complete. Guardian recovery and owner changes are not implemented in this Milestone 2 prototype.')),
      h('footer',null,'The contract enforces approvals, limits and time. The dashboard refreshes every 4 seconds.')));
}
createRoot(document.getElementById('root')).render(h(App));
