import ganache from 'ganache';

// These accounts are public development accounts. Use local test ETH only.
const server = ganache.server({
  chain: { chainId: 1337, hardfork: 'shanghai' },
  wallet: { deterministic: true, totalAccounts: 2 },
  logging: { quiet: true }
});
await server.listen(8545, '127.0.0.1');
console.log('DAMD Local: http://127.0.0.1:8545 | chain ID: 1337');
console.log('Import this disposable test account into MetaMask:');
const [address, account] = Object.entries(server.provider.getInitialAccounts())[0];
console.log('Address:', address);
console.log('Public development key:', account.secretKey);
console.log('Use on this local blockchain only. Never send real funds here.');
