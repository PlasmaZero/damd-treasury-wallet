# Test coverage record

`npm test` compiles the contracts, then runs the Node test files with one worker.
Each contract test starts from an EVM snapshot. Ganache uses a fixed starting time
and zero timestamp increment; `mineAt` sets exact boundary timestamps.
Custom-error assertions decode ABI revert data and event assertions check ordering.

## Contract suite: 29 named tests

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

## Service suite: 5 named tests

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
