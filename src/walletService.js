import {BrowserProvider,Contract,JsonRpcProvider,formatEther,parseEther,isAddress} from 'ethers';
export async function createService() {
  const response = await fetch('/deployment.json');
  if(!response.ok) throw new Error('Run npm run chain and npm run deploy first, then reload.');
  const config = await response.json();
  const reader = new JsonRpcProvider('http://127.0.0.1:8545',1337,{cacheTimeout:0});
  if((await reader.getNetwork()).chainId !== 1337n) throw new Error('Wrong RPC network');
  if(await reader.getCode(config.address) === '0x') throw new Error('Contract missing. Run npm run deploy after restarting the chain.');
  const contract = new Contract(config.address,config.abi,reader);
  let signer = null;
  async function connect() {
    if(!window.ethereum) throw new Error('Install MetaMask to sign local test transactions.');
    const provider = new BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts',[]);
    if((await provider.getNetwork()).chainId !== 1337n) throw new Error('Select the local network, chain ID 1337, in MetaMask.');
    signer = await provider.getSigner();
    return signer.getAddress();
  }
  async function write(method,...args) {
    await connect();
    return contract.connect(signer)[method](...args);
  }
  return {
    config,connect,
    async snapshot() {
      const [balance,threshold,limit,delay,count,block] = await Promise.all([reader.getBalance(config.address),contract.threshold(),contract.spendingLimit(),contract.delaySeconds(),contract.paymentCount(),reader.getBlock('latest')]);
      const payments = await Promise.all(Array.from({length:Number(count)},async(_,id)=>{
        const p = await contract.payments(id);
        const votes = await Promise.all(config.owners.map(owner=>contract.approved(id,owner)));
        return {id,recipient:p.recipient,amount:formatEther(p.amount),approvals:Number(p.approvals),readyAt:Number(p.readyAt),executed:p.executed,approvers:config.owners.filter((_,i)=>votes[i])};
      }));
      return {balance:formatEther(balance),threshold:Number(threshold),limit:formatEther(limit),delay:Number(delay),timestamp:block.timestamp,payments};
    },
    async deposit(amount) {
      await connect();
      const value=parseEther(amount); if(value<=0n) throw new Error('Enter a positive amount');
      return signer.sendTransaction({to:config.address,value});
    },
    async propose(recipient,amount) {
      if(!isAddress(recipient)) throw new Error('Enter a valid Ethereum address');
      return write('propose',recipient,parseEther(amount));
    },
    approve:id=>write('approve',id), execute:id=>write('execute',id)
  };
}
