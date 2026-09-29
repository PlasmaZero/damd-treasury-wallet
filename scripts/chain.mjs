import ganache from 'ganache';
// Ganache's deterministic accounts are public development accounts. Never fund them on a real network.
const server = ganache.server({chain:{chainId:1337,hardfork:'shanghai'},wallet:{deterministic:true,totalAccounts:6},miner:{blockTime:1},logging:{quiet:true}});
await server.listen(8545,'127.0.0.1');
console.log('Local development chain: http://127.0.0.1:8545, chain ID 1337');
console.log('Disposable public development keys, for MetaMask local testing ONLY:');
Object.entries(server.provider.getInitialAccounts()).forEach(([address,a],i) => console.log(`Account ${i}: ${address}\nDevelopment key: ${a.secretKey}`));
