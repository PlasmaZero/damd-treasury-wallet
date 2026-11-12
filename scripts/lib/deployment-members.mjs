// The factory indexes creation-time members. Governance and recovery deliberately
// update only the treasury, so current membership cannot validate this index.
export async function verifyFactoryWallet(provider, factory, wallet) {
  const address = await wallet.getAddress();
  const block = Number(await wallet.deployedAtBlock());
  const [created] = await factory.queryFilter(factory.filters.WalletCreated(address), block, block);
  if (!created) throw new Error(`no WalletCreated event for ${address} from the recorded factory in block ${block}`);
  const receipt = await provider.getTransactionReceipt(created.transactionHash);
  if (!receipt || receipt.status !== 1) throw new Error('wallet creation receipt is unavailable or unsuccessful');
  const members = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address.toLowerCase() || log.index >= created.index) continue;
    const event = wallet.interface.parseLog(log);
    if (event?.name === 'OwnerAdded') members.push(event.args.owner);
    if (event?.name === 'GuardianAdded') members.push(event.args.guardian);
  }
  if (!members.length) throw new Error('wallet creation receipt has no initial membership events');
  for (const member of members)
    if (!(await factory.walletsOf(member)).some(w => w.toLowerCase() === address.toLowerCase()))
      throw new Error(`walletsOf(${member}) does not include its creation-time wallet ${address}`);
  return {block, members, txHash: created.transactionHash};
}
