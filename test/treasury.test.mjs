import '../scripts/compile.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, parseEther } from 'ethers';

const artifact = JSON.parse(fs.readFileSync('artifacts/Treasury.json', 'utf8'));

async function setup(t) {
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'shanghai' } });
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: 0 });
  provider.pollingInterval = 10;
  t.after(async () => { provider.destroy(); await rpc.disconnect(); });
  const signer = await provider.getSigner();
  const treasury = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy();
  await treasury.waitForDeployment();
  return { treasury, signer, provider };
}

test('new treasury starts with zero balance', async t => {
  const { treasury } = await setup(t);
  assert.equal(await treasury.getBalance(), 0n);
});

test('deposits from different accounts accumulate and record sender and amount', async t => {
  const { treasury, signer, provider } = await setup(t);
  const address = await treasury.getAddress();
  for (const depositor of [signer, await provider.getSigner(1)]) {
    const transaction = await depositor.sendTransaction({ to: address, value: parseEther('0.1') });
    const receipt = await transaction.wait();
    const event = treasury.interface.parseLog(receipt.logs[0]);
    assert.equal(event.name, 'Deposited');
    assert.equal(event.args.sender, await depositor.getAddress());
    assert.equal(event.args.amount, parseEther('0.1'));
  }
  assert.equal(await treasury.getBalance(), parseEther('0.2'));
});
