# Milestone 4 security scenarios and warnings

This package adds 15 named Node tests to the 51-test M4 demo baseline: nine adversarial
contract scenarios, four warning/preview tests and two service cases. The resulting
inventory is 66 tests, plus a separate Playwright walkthrough. Solidity contracts, ABI
and committed deployment addresses are unchanged. PR #9 is excluded.

## Added security cases

| Scenario | Expected result |
| --- | --- |
| Guardians collude to spend or grant themselves owner powers | Each operation fails with NotOwner; no payment or membership change |
| Compromised target vetoes approved recovery | Target cancellation succeeds; recovery cannot execute; remaining owner quorum can use ReplaceOwner |
| One guardian is unavailable when every guardian is required | Recovery remains below quorum; owner governance adds an accessible guardian; fresh approval enables recovery |
| Owner quorum is unavailable due to lost keys | Guardians recover a seat; the replacement and remaining accessible owner restore governance quorum |
| Two queued governance actions create a role conflict | The later conflicting action fails at execution; queued state and treasury funds remain intact |
| Recovery replacement becomes a guardian after request creation | Execution fails; service displays a membership-conflict reason; removing the conflicting role clears the block without restarting the recovery timer |
| Competing queued payments jointly exceed the daily cap | Earlier valid payments execute; the excess payment stays queued and transfers no ETH |
| An owner who voted to veto recovery is removed and re-added | The old cancellation vote stays invalid; a new vote is required |
| Governance changes delay and payment tier after queueing | Original readyAt is preserved; execution follows documented current-rule checks |
| A fresh service starts after external changes with no event subscription | It rereads updated funds, requests and account roles from the chain |

These are multi-signer local EVM scenarios. The service missed-event case does not claim
actual MetaMask extension or physical RPC outage acceptance. Most expected rejections
use eth_call and assert the precise custom error plus unchanged state; successful
transitions send and confirm transactions.

## Warnings and where to show them

- M=1: a single owner can authorize payments and governance. Shown in creation, overview,
  governance previews and recovery where applicable.
- K=1: one guardian can authorize a recovery request. The warning explicitly retains the
  delay, replacement-confirmation and cancellation conditions.
- M=N: the other owners cannot reach an M-vote recovery veto against a current target.
- K=G: every guardian must be accessible; owners need to repair guardian membership if one is lost.
- Governance removal previews use the proposed owner/guardian list, so reducing membership
  can immediately surface M=N or K=G warnings before signing.
- Recovery shows prominent warnings that both inaccessible quorums have no emergency bypass
  and that a stolen target key can cancel guardian recovery. Owner governance is the remaining
  route when an owner quorum remains available.
- Existing stale-target Invalidated and replacement-membership-conflict notices remain.

Warnings describe valid but risky settings. They do not silently change the contract's
permitted thresholds or bypass approval rules. Existing validation handles invalid settings.

## Browser checks

The walkthrough now checks the single-guardian warning, guardian-removal warning and
owner-removal warning in the actual governance UI, alongside the existing M=1 creation
warning. Time advancement is followed by an explicit state refresh, rather than waiting
for the periodic heartbeat. Wallet-switch balance assertions wait for the selected
wallet's data. Contract tests independently check the exact timelock boundaries.

For a live warning demo, select Governance → Set Guardian Threshold and enter 1 without
submitting. Next preview Remove Guardian in a 2-of-3 guardian wallet, or Remove Owner in
a 2-of-3 owner wallet, and show the new all-members/quorum warning. No signed governance
transaction is needed to demonstrate the previews.

## Limits that remain

A quorum of owners is authorized to move funds and change policy by design. These tests
do not promise protection against that authorized quorum colluding. Guardian honesty,
monitoring/cancellation windows, irreversible lost access to both quorums, arbitrary
governance/recovery fuzzing, real MetaMask acceptance, real RPC outage/reconnect checks,
coverage percentage and independent auditing remain distinct work. Public deployment
verification and hosted CI status must be reported from their actual run results.

## Commands

    npm ci
    npm test
    npm run lint
    npm run build
    npx playwright install chromium
    npm run test:browser

The focused added-security/warning/service group is:

    node --test --test-concurrency=1 test/security.test.mjs test/safety.test.mjs test/service.test.mjs
