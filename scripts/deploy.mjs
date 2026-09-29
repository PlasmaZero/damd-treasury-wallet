import './compile.mjs';
import fs from 'node:fs';
import { ContractFactory, JsonRpcProvider } from 'ethers';

const provider = new JsonRpcProvider('http://127.0.0.1:8545');
if ((await provider.getNetwork()).chainId !== 1337n) {
  throw new Error('Start the local blockchain with npm run chain first.');
}
const signer = await provider.getSigner(0);
const artifact = JSON.parse(fs.readFileSync('artifacts/Treasury.json', 'utf8'));
const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
const treasury = await factory.deploy();
await treasury.waitForDeployment();

const address = await treasury.getAddress();
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/deployment.json', JSON.stringify({
  address, chainId: 1337, abi: artifact.abi
}, null, 2));
console.log('Treasury deployed:', address);
console.log('Starting treasury balance: 0 test ETH');
