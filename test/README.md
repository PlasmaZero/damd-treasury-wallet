# Test coverage record

`npm test` compiles the contracts, then runs the Node test files with one worker.
Each contract test starts from an EVM snapshot. Ganache uses a fixed starting time
and zero timestamp increment; `mineAt` sets exact boundary timestamps.
Custom-error assertions decode ABI revert data and event assertions check ordering.

## Contract suite: 34 named tests

- Constructor: zero, duplicate and overlapping roles; invalid thresholds, limits and delays.
- Constructor events; fresh zero balance; multi-account deposits and event amounts.
- Auto-approval and 1-of-1 queue/event ordering.
- Unauthorized proposal, approval, revoke, cancel, execute and recovery initiation.
- Zero/self/invalid recipient and per-payment cap, including exact cap acceptance.
- Unknown IDs.
- Duplicate approval, revoke and reapproval.
- Queue start, amount tier, no timer restart and no revocation after queueing.
- Exact readyAt−1 / readyAt boundary, recipient balance, event order and replay rejection.
- Inclusive expiry boundary, derived Expired, rejection after expiry.
- Exact daily cap, +1 wei rejection and UTC-day reset.
- Insufficient balance preserves proposal.
- Reverting recipient preserves status/accounting.
- Recipient attempts reentry into execute, approve and executeRecovery.
- N−M+1 cancellation threshold and duplicate cancel votes.
- Every governance ActionType succeeds through the proposal lifecycle.
- Governance malformed params, role conflicts and invalid values fail.
- Removed/readded owner approvals cannot revive.
- Raised threshold and reduced spending cap apply at execution.
- Recovery role/duplicate/reservation checks.
- Recovery quorum, exact delay boundary, new-owner confirmation, single-seat replacement,
  unchanged funds/guardians/threshold, and replay protection.
- Target direct veto and M-owner veto excluding the target.
- Expiry frees recovery reservations without cleanup transaction.
- Removed guardian votes stop counting and another guardian restores quorum.
- Governance replacement invalidates stale recovery execution.
- Recovery invalidates the old owner's payment approvals.
- Factory indexing, creator has no extra owner role, invalid config rejection.
- Round-trip parameter encoding for every action.
- Seeded fast-check payment sequences: cap, quorum, timelock, cancellation, at-most-once,
  aggregate spending, and ETH outflow accounting. Seed 416; six generated runs.

## Service suite: 8 named tests

- Real service wallet creation, deposit, preview, approval, execution, history,
  account change, wrong network and signature rejection.
- Real governance and recovery integration with frozen data shapes.
- Stale factory memberships filtered; manual wallet additions retained.
- Mock fixture statuses, deposit accounting, and target cancellation.
- Mock preview does not mutate state; observer cannot propose.

## Browser walkthrough

`npm run test:browser` starts its own chain and server. It uses a local EIP-1193
adapter, not the actual MetaMask extension. It exercises UI connection, deposit,
three-account proposal approval and execution, governance, full guardian recovery,
event history, and mobile overflow. Screenshots are temporary outputs in test-results/.

## Limits

This is meaningful regression coverage, not an audit or exhaustive formal proof.
Random sequences focus on payment invariants; arbitrary governance/recovery state-machine
fuzzing, all RPC outages, chain reorgs, Slither and Foundry invariant runners remain outside
this suite. Manual MetaMask steps are listed separately in docs/DEMO.md.


## M4 regression additions

- Five contract cases: preserved timer after quorum restoration; removed/readded cancellation
  votes; removed/readded guardians; changed guardian threshold; stale target generations.
- Two real-service cases: fresh-session discovery after governance/recovery across independent
  wallets; invalidated recovery presentation while direct cancellation remains available.
- Mock regression: stale recovery targets display Invalidated while cancellation remains usable.
- One configuration-warning unit test (test/safety.test.mjs).
- Browser additions: a second treasury created in the UI, account/treasury isolation,
  M=1 warning, signature rejection/retry, disabled early execution, payment cancellation,
  expiry, direct recovery veto, and multi-owner recovery veto.

Original M4 checkpoint: 43 Node tests (34 contract, 8 service/mock, 1 warning). Counts describe implemented
checks, not a coverage percentage or a completed Milestone 5 integration campaign.
The full planned coverage and manual acceptance scenarios are in docs/TEST_PLAN.md.


## CI public testnet automation tests

Five explorer-client cases cover exact compiler/constructor submission, pending verification,
already-verified source/compiler checks, bounded timeout, rejected bytecode/credentials redaction,
and indexing-delay retry (grouped into five named tests). Three public-journey cases cover
runtime comparison, wrong-network/budget rejection, and the complete multi-signer transaction
journey on an isolated local chain. Total named Node tests are now 51: the earlier 43 plus
these 8 automation regressions. Public runtime checks cannot be inferred from those counts.

`npm run test:sepolia:rehearse` additionally builds an isolated app copy and rehearses the
production UI checks against the journey's real local contracts. It preserves the main local
deployment files. Neither that rehearsal nor mocked explorer responses count as an actual
Sepolia acceptance run. See docs/SEPOLIA_CI.md for the separate public CI job and evidence.
