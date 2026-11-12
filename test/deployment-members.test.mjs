import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Contract} from 'ethers';
import {setup, sent, artifact} from './helpers/fixture.mjs';
import {ACTION_TYPES, encodeParams} from '../src/contract/params.js';
import {verifyFactoryWallet} from '../scripts/lib/deployment-members.mjs';

test('deployment verification accepts governance and recovery changes to factory-created wallets', async () => {
  const f = await setup();
  try {
    const factory = await f.deploy('TreasuryFactory');
    const receipt = await sent(factory.createWallet(f.config));
    const event = receipt.logs.map(log => factory.interface.parseLog(log)).find(e => e?.name === 'WalletCreated');
    const wallet = new Contract(event.args.wallet, artifact('Treasury').abi, f.signers[0]);
    const initial = await verifyFactoryWallet(f.provider, factory, wallet);
    assert.deepEqual(initial.members, [...f.config.owners, ...f.config.guardians]);
    await sent(wallet.proposeAction(ACTION_TYPES.AddOwner, encodeParams('AddOwner', {owner: f.accounts[6]})));
    await sent(wallet.connect(f.signers[1]).approve(0));
    await f.advance(60); await sent(wallet.execute(0));
    await sent(wallet.connect(f.signers[3]).initiateRecovery(f.accounts[2], f.accounts[8]));
    await sent(wallet.connect(f.signers[4]).approveRecovery(0));
    await sent(wallet.connect(f.signers[8]).confirmRecovery(0));
    await f.advance(60); await sent(wallet.connect(f.signers[8]).executeRecovery(0));
    assert.equal(await wallet.isOwner(f.accounts[6]), true);
    assert.equal(await wallet.isOwner(f.accounts[8]), true);
    assert.deepEqual([...await factory.walletsOf(f.accounts[6])], []);
    assert.deepEqual([...await factory.walletsOf(f.accounts[8])], []);
    assert.deepEqual(await verifyFactoryWallet(f.provider, factory, wallet), initial);
    const otherFactory = await f.deploy('TreasuryFactory');
    await assert.rejects(verifyFactoryWallet(f.provider, otherFactory, wallet), /no WalletCreated event/);
    await assert.rejects(verifyFactoryWallet(f.provider, {
      filters: factory.filters, queryFilter: (...args) => factory.queryFilter(...args), walletsOf: async () => []
    }, wallet), /does not include its creation-time wallet/);
  } finally {f.provider.destroy(); await f.rpc.disconnect();}
});
