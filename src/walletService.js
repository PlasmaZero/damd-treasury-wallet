import { BrowserProvider, Contract, JsonRpcProvider, formatEther, parseEther } from 'ethers';

// Keep blockchain code separate from the React interface.
export async function createService() {
  const response = await fetch('/deployment.json');
  if (!response.ok) throw new Error('Run npm run deploy, then reload this page.');
  const config = await response.json();
  const reader = new JsonRpcProvider('http://127.0.0.1:8545', 1337, { cacheTimeout: 0 });
  if (await reader.getCode(config.address) === '0x') {
    throw new Error('Contract not found. Run npm run deploy again, then reload.');
  }
  const treasury = new Contract(config.address, config.abi, reader);

  async function getSigner() {
    if (!window.ethereum) throw new Error('Install MetaMask to connect a wallet.');
    const provider = new BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    if ((await provider.getNetwork()).chainId !== 1337n) {
      throw new Error('Select DAMD Local (chain ID 1337) in MetaMask.');
    }
    return provider.getSigner();
  }

  return {
    address: config.address,
    async connect() {
      const signer = await getSigner();
      return signer.getAddress();
    },
    async getBalance() {
      return formatEther(await treasury.getBalance());
    },
    async deposit(amount) {
      const value = parseEther(amount);
      if (value <= 0n) throw new Error('Enter an amount greater than zero.');
      const signer = await getSigner();
      return signer.sendTransaction({ to: config.address, value });
    }
  };
}
