import assert from 'node:assert/strict';
import {Contract, ContractFactory, Interface, NonceManager, Wallet, getAddress, keccak256, parseEther, parseUnits} from 'ethers';
import {createWalletService} from '../../src/services/walletService.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const stringify = value => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';

export function assertRuntimeMatches(actual, artifact) {
  assert.notEqual(actual, '0x', 'No deployed contract code.');
  const expected = artifact.deployedBytecode?.slice(2).toLowerCase();
  assert.ok(expected?.length, 'Compiled runtime bytecode is missing.');
  let observed = actual.slice(2).toLowerCase(), masked = expected;
  assert.equal(observed.length, masked.length, 'Deployed runtime length differs from this build.');
  for (const ranges of Object.values(artifact.immutableReferences ?? {})) for (const {start, length} of ranges) {
    assert.ok(start >= 0 && length > 0 && (start + length) * 2 <= observed.length, 'Invalid immutable reference.');
    const zeros = '0'.repeat(length * 2), offset = start * 2;
    observed = observed.slice(0, offset) + zeros + observed.slice(offset + zeros.length);
    masked = masked.slice(0, offset) + zeros + masked.slice(offset + zeros.length);
  }
  assert.equal(observed, masked, 'On-chain code does not match this compiler build.');
  return {runtimeCodeHash:keccak256(actual), maskedBuildHash:keccak256(`0x${masked}`)};
}

export async function expectContractError(action, name, iface) {
  try { await action(); } catch (error) {
    const candidates = [error.data, error.data?.result, error.info?.error?.data,
      error.info?.error?.data?.result, error.error?.data];
    for (const data of candidates) if (typeof data === 'string') {
      try { if (iface.parseError(data)?.name === name) return; } catch { /* next representation */ }
    }
    throw Error(`Expected ${name}, but RPC did not return that contract error.`);
  }
  throw Error(`Expected ${name}, but the action succeeded.`);
}

// Production waits on real chain time. Only the explicit local rehearsal may inject a clock.
export async function runPublicJourney({provider, deployer, artifacts, report = {}, mode = 'public',
  confirmations = 2, budgetWei = parseEther('0.1'), feeCapWei = parseUnits('10', 'gwei'),
  onProgress = () => {}, waitForTime, pollMs = 4000, receiptTimeoutMs = 300000}) {
  assert.ok(['public','local-rehearsal'].includes(mode), 'Unknown execution mode.');
  if (mode === 'public' && waitForTime) throw Error('Public checks cannot use a simulated clock.');
  const requiredChain = mode === 'public' ? 11155111 : 1337;
  assert.equal(Number((await provider.getNetwork()).chainId), requiredChain, 'Wrong network; no transactions sent.');
  assert.ok(Number.isInteger(confirmations) && confirmations > 0, 'Invalid confirmation count.');
  const signer = new NonceManager(deployer), payer = getAddress(await signer.getAddress());
  const fees = await provider.getFeeData(), maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice;
  assert.ok(maxFeePerGas > 0n && maxFeePerGas <= feeCapWei, 'Network fee exceeds the configured test fee cap.');
  const actors = Array.from({length:6}, () => new NonceManager(Wallet.createRandom().connect(provider)));
  const addresses = await Promise.all(actors.map(a => a.getAddress()));
  const [owner0, owner1, _owner2, guardian0, guardian1, replacement] = actors;
  const [a0, a1, a2, g0, g1, nextOwner] = addresses;
  const recipient = Wallet.createRandom().address;
  assert.equal(new Set([payer,recipient,...addresses]).size, 8, 'Test roles must have distinct addresses.');
  const fundingGas = [1200000n,800000n,500000n,600000n,300000n,600000n];
  const estimatedCeiling = (17000000n + fundingGas.reduce((a,b) => a+b,0n)) * maxFeePerGas + parseEther('0.000003');
  assert.ok(estimatedCeiling <= budgetWei, 'Conservative run estimate exceeds SEPOLIA_MAX_SPEND_ETH.');
  assert.ok(await provider.getBalance(payer) >= estimatedCeiling, 'Fund the test-only deployer before running CI.');
  Object.assign(report, {schemaVersion:1, mode, chainId:requiredChain, status:'running',
    startedAt:new Date().toISOString(), deployer:payer, recipient, confirmations,
    budgetWei:String(budgetWei), feeCapWei:String(feeCapWei), transactions:[], checks:[], sourceVerification:[]});
  let reservedSpend = 0n;
  const progress = () => onProgress(report);
  const check = (name, detail = {}) => { report.checks.push({name,status:'passed',...detail}); progress(); };
  async function send(who, request, name) {
    report.stage = name; progress();
    const from = await who.getAddress();
    const quote = await provider.getFeeData();
    const txMaxFee = quote.maxFeePerGas ?? quote.gasPrice;
    assert.ok(txMaxFee > 0n && txMaxFee <= feeCapWei, 'Network fee exceeds the configured test fee cap.');
    const priority = quote.maxPriorityFeePerGas ?? txMaxFee;
    const feeFields = {maxFeePerGas:txMaxFee,maxPriorityFeePerGas:priority>txMaxFee?txMaxFee:priority};
    let estimate;
    try { estimate = await provider.estimateGas({...request, from}); } catch(error) {
      const reason = `${error.shortMessage??''} ${error.info?.error?.message??''}`;
      if (getAddress(from)===payer || !/insufficient funds|gas required exceeds allowance/i.test(reason)) throw error;
      await send(signer,{to:from,value:500000n*txMaxFee},`restore gas allowance for ${name}`);
      estimate = await provider.estimateGas({...request,from});
      report.stage=name;
    }
    const gasLimit = estimate * 12n / 10n + 1000n;
    if (getAddress(from) === payer) {
      reservedSpend += gasLimit * txMaxFee + BigInt(request.value ?? 0);
      assert.ok(reservedSpend <= budgetWei, 'Deployer spending bound exceeds the configured run budget.');
      report.deployerSpendBoundWei = String(reservedSpend);
    } else {
      // Size a top-up from the actual estimated transaction, not an assumed role budget.
      const required = gasLimit * txMaxFee + BigInt(request.value ?? 0);
      const available = await provider.getBalance(from);
      if (available < required) await send(signer,
        {to:from,value:required-available+gasLimit*txMaxFee}, `top up signer for ${name}`);
      report.stage = name;
    }
    const started = Date.now();
    const tx = await who.sendTransaction({...request, gasLimit, ...feeFields});
    const record = {name,txHash:tx.hash,from,explorerUrl:mode === 'public' ? `https://sepolia.etherscan.io/tx/${tx.hash}` : null,status:'submitted'};
    report.transactions.push(record); progress();
    const receipt = await tx.wait(confirmations, receiptTimeoutMs);
    assert.equal(receipt?.status, 1, `${name} did not produce a successful receipt.`);
    Object.assign(record, {status:'confirmed', blockNumber:receipt.blockNumber, blockHash:receipt.blockHash,
      gasUsed:String(receipt.gasUsed), gasPriceWei:String(receipt.gasPrice), elapsedMs:Date.now()-started});
    progress(); return receipt;
  }
  async function call(contract, who, method, args, name) {
    return send(who, await contract[method].populateTransaction(...args), name);
  }
  async function waitUntil(target) {
    if (waitForTime) return waitForTime(Number(target));
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline) {
      const block = await provider.getBlock('latest');
      if (block && BigInt(block.timestamp) >= BigInt(target)) return;
      await sleep(pollMs);
    }
    throw Error('Timed out waiting for public chain timelock.');
  }
  async function runtime(address, artifact) {
    const code = await provider.getCode(address);
    const hashes = assertRuntimeMatches(code, artifact);
    check(`runtime matches ${artifact.contractName}`, {address,...hashes}); return hashes;
  }
  const config = {owners:[a0,a1,a2], threshold:2, guardians:[g0,g1], guardianThreshold:2,
    limits:{perTxCap:parseEther('0.001'),dailyCap:parseEther('0.005'),smallTierCap:parseEther('0.0005')},
    delays:{smallTierDelay:60,largeTierDelay:60,governanceDelay:60,recoveryDelay:60,proposalTTL:3600,recoveryTTL:3600}};
  const factoryType = new ContractFactory(artifacts.TreasuryFactory.abi, artifacts.TreasuryFactory.bytecode);
  const deployed = await send(signer, await factoryType.getDeployTransaction(), 'deploy factory');
  assert.ok(deployed.contractAddress, 'Factory receipt has no contract address.');
  const factoryAddress = getAddress(deployed.contractAddress);
  const factory = new Contract(factoryAddress, artifacts.TreasuryFactory.abi, signer);
  const factoryCode = await runtime(factoryAddress, artifacts.TreasuryFactory);
  assert.equal(await factory.deployedAtBlock(), BigInt(deployed.blockNumber));
  report.factory = {address:factoryAddress,blockNumber:deployed.blockNumber,...factoryCode}; progress();
  for (let i=0;i<actors.length;i++) await send(signer, {to:addresses[i],value:fundingGas[i]*maxFeePerGas}, `fund test signer ${i}`);
  async function create(name) {
    const receipt = await call(factory, signer, 'createWallet', [config], `create ${name}`);
    const event = receipt.logs.flatMap(log => {try {const e=factory.interface.parseLog(log);return e?.name==='WalletCreated'?[e]:[];}catch{return [];}})[0];
    assert.ok(event, 'Missing WalletCreated event.');
    const address = getAddress(event.args.wallet), hashes = await runtime(address, artifacts.Treasury);
    const contract = new Contract(address, artifacts.Treasury.abi, provider);
    assert.equal(await contract.deployedAtBlock(), BigInt(receipt.blockNumber));
    return {address,contract,blockNumber:receipt.blockNumber,...hashes};
  }
  const first = await create('wallet A'), second = await create('wallet B'), wallet = first.contract;
  report.wallets = {primary:{...first,contract:undefined},secondary:{...second,contract:undefined}};
  report.initialConfig = config;
  const constructorArguments = new Interface(artifacts.Treasury.abi).encodeDeploy([config]).slice(2);
  const verifyTargets = [
    {address:factoryAddress,contractName:'contracts/TreasuryFactory.sol:TreasuryFactory',constructorArguments:''},
    {address:first.address,contractName:'contracts/Treasury.sol:Treasury',constructorArguments},
    {address:second.address,contractName:'contracts/Treasury.sol:Treasury',constructorArguments}];
  progress();
  const amount = parseEther('0.000001'), deposit = amount*3n;
  await send(signer, {to:first.address,value:deposit}, 'deposit test ETH');
  assert.equal(await provider.getBalance(first.address), deposit); check('deposit balance');
  await expectContractError(() => wallet.connect(guardian0).proposePayment.staticCall(recipient,amount), 'NotOwner', wallet.interface);
  await expectContractError(() => wallet.connect(owner0).proposePayment.staticCall(recipient,config.limits.perTxCap+1n), 'AboveTxCap', wallet.interface);
  check('non-owner proposal and over-cap payment rejected');
  await call(wallet, owner0, 'proposePayment', [recipient,amount], 'propose payment');
  assert.equal(await wallet.liveApprovals(0), 1n);
  await expectContractError(() => wallet.connect(owner0).approve.staticCall(0), 'AlreadyApproved', wallet.interface);
  await expectContractError(() => wallet.connect(guardian0).approve.staticCall(0), 'NotOwner', wallet.interface);
  await expectContractError(() => wallet.connect(guardian0).execute.staticCall(0), 'NotOwner', wallet.interface);
  assert.equal(await wallet.liveApprovals(0), 1n);
  check('duplicate approval, non-owner approval and non-owner execution rejected');
  await expectContractError(() => wallet.connect(owner0).execute.staticCall(0), 'WrongStatus', wallet.interface);
  check('execution rejected without quorum');
  const quorumReceipt = await call(wallet, owner1, 'approve', [0], 'second owner payment approval');
  const payment = await wallet.getProposal(0);
  assert.equal(payment.status, 1n);
  await expectContractError(() => wallet.connect(owner0).execute.staticCall(0,{blockTag:quorumReceipt.blockNumber}), 'TimelockActive', wallet.interface);
  check('early execution rejected',{method:'eth_call',blockNumber:quorumReceipt.blockNumber});
  await waitUntil(payment.readyAt);
  const recipientBefore = await provider.getBalance(recipient);
  const paymentReceipt = await call(wallet, owner1, 'execute', [0], 'execute payment');
  assert.equal((await wallet.getProposal(0)).status, 2n);
  assert.equal(await provider.getBalance(recipient,paymentReceipt.blockNumber), recipientBefore+amount);
  assert.equal(await provider.getBalance(first.address), deposit-amount);
  assert.equal(await wallet.spentToday({blockTag:paymentReceipt.blockNumber}), amount);
  check('payment executed with exact balance and spending changes');
  await expectContractError(() => wallet.connect(owner0).execute.staticCall(0), 'WrongStatus', wallet.interface);
  check('payment replay rejected');
  await call(wallet, owner0, 'proposePayment', [recipient,amount], 'propose cancellable payment');
  await call(wallet, owner1, 'voteCancel', [1], 'first owner cancellation vote');
  assert.equal((await wallet.getProposal(1)).status, 0n);
  await call(wallet, owner0, 'voteCancel', [1], 'second owner cancellation vote');
  assert.equal((await wallet.getProposal(1)).status, 3n); check('payment cancellation quorum');
  await expectContractError(() => wallet.connect(owner0).execute.staticCall(1), 'WrongStatus', wallet.interface);
  check('cancelled payment cannot execute');
  async function governance(action, params, approver=owner1) {
    const id = await wallet.proposalCount();
    await call(wallet, owner0, 'proposeAction', [action,params], `propose governance ${id}`);
    await call(wallet, approver, 'approve', [id], `approve governance ${id}`);
    await waitUntil((await wallet.getProposal(id)).readyAt);
    await call(wallet, owner0, 'execute', [id], `execute governance ${id}`);
    assert.equal((await wallet.getProposal(id)).status, 2n);
  }
  const coder = new Interface(artifacts.Treasury.abi).getAbiCoder();
  await governance(1, coder.encode(['address'],[payer]));
  assert.equal(await wallet.isOwner(payer), true);
  const service = createWalletService({provider,chainId:requiredChain,factory:factoryAddress,storage:{getItem:()=>null,setItem:()=>{}}});
  assert.deepEqual(await service.listWallets(payer), [first.address]); check('governance and fresh-member discovery');
  await call(wallet, guardian0, 'initiateRecovery', [a2,nextOwner], 'initiate owner recovery');
  await expectContractError(() => wallet.connect(owner0).approveRecovery.staticCall(0), 'NotGuardian', wallet.interface);
  await expectContractError(() => wallet.connect(guardian0).approveRecovery.staticCall(0), 'AlreadyApproved', wallet.interface);
  await expectContractError(() => wallet.connect(owner0).confirmRecovery.staticCall(0), 'NotAuthorized', wallet.interface);
  await expectContractError(() => wallet.connect(guardian0).executeRecovery.staticCall(0), 'WrongStatus', wallet.interface);
  check('unauthorized and duplicate guardian votes, wrong replacement and missing recovery quorum rejected');
  await call(wallet, guardian1, 'approveRecovery', [0], 'second guardian recovery approval');
  await waitUntil((await wallet.getRecovery(0)).readyAt);
  await expectContractError(() => wallet.connect(guardian0).executeRecovery.staticCall(0), 'NewOwnerNotConfirmed', wallet.interface);
  check('recovery requires replacement confirmation after timelock');
  await call(wallet, replacement, 'confirmRecovery', [0], 'replacement confirms recovery');
  await call(wallet, guardian0, 'executeRecovery', [0], 'execute owner recovery');
  assert.equal((await wallet.getRecovery(0)).status, 2n);
  assert.equal(await wallet.isOwner(a2), false); assert.equal(await wallet.isOwner(nextOwner), true);
  assert.equal(await provider.getBalance(first.address), deposit-amount);
  check('multi-guardian recovery replaces only the owner and preserves funds');
  await call(wallet, guardian0, 'initiateRecovery', [a1,a2], 'initiate target-veto recovery');
  await call(wallet, owner1, 'cancelRecovery', [1], 'target cancels recovery');
  assert.equal((await wallet.getRecovery(1)).status, 3n); check('target recovery veto');
  await call(wallet, guardian0, 'initiateRecovery', [a1,a2], 'initiate owner-veto recovery');
  await call(wallet, owner0, 'voteCancelRecovery', [2], 'first other-owner recovery veto');
  await call(wallet, replacement, 'voteCancelRecovery', [2], 'second other-owner recovery veto');
  assert.equal((await wallet.getRecovery(2)).status, 3n); check('multi-owner recovery veto');
  await call(wallet, guardian0, 'initiateRecovery', [a1,a2], 'initiate recovery before governance replacement');
  await governance(3, coder.encode(['address','address'],[a1,a2]), replacement);
  assert.equal(await wallet.isRecoveryTargetCurrent(3), false);
  const stale = await service.getRecovery(first.address,3);
  assert.equal(stale.status, 'Invalidated'); assert.ok(stale.blockedReason);
  check('governance invalidates stale recovery in the real service');
  await call(wallet, owner1, 'cancelRecovery', [3], 'old target cancels invalidated recovery');
  assert.equal((await wallet.getRecovery(3)).status, 3n);
  assert.equal(await provider.getBalance(second.address), 0n);
  assert.equal(await second.contract.proposalCount(), 0n);
  assert.equal(await second.contract.recoveryCount(), 0n);
  assert.equal(await second.contract.isOwner(payer), false); check('independent wallet state');
  const history = await service.getHistory(first.address);
  for (const event of ['PaymentSent','RecoveryExecuted','RecoveryCancelled','OwnerReplaced']) assert.ok(history.some(e => e.event === event), `Missing ${event}`);
  check('real transaction event history');
  report.expected = {balanceWei:String(deposit-amount),proposals:Number(await wallet.proposalCount()),
    recoveries:Number(await wallet.recoveryCount()),currentOwners:[...(await wallet.getConfig()).owners]};
  report.status = 'functional-checks-passed'; report.stage = 'functional checks complete';
  report.functionalCompletedAt = new Date().toISOString(); progress();
  return {report,verifyTargets};
}

