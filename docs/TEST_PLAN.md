# Milestone 4 test plan

This is the feature-complete checkpoint and a plan for systematic testing and integration.
Focused developer checks support the M4 changes. They are not the Milestone 5 integration
results report, a public deployment, an external security audit, or final acceptance.

## Environment and reproducibility

- Node.js 22.12+; pinned dependencies installed with `npm ci`.
- Solidity 0.8.24, optimizer 200, EVM paris; Ganache chain 1337.
- Only disposable local development accounts and test ETH. No private keys in the UI.
- Contract/service tests use deterministic accounts and isolated snapshots. Random payment
  tests retain seed 416. Record any new failing seed when extending randomized coverage.
- Browser tests use Playwright Chromium and an injected EIP-1193 adapter. Actual MetaMask
  prompts, permissions, and extension account/network behavior require manual testing.
- `npm run chain`, then `npm run deploy`, then `npm run dev` start the manual environment.
  After resetting the chain, always deploy again. M3 contracts lack the M4 recovery view.
- Reserve ports 8545 and 5174 for `npm run test:browser`; stop the manual chain first.

## Execution commands

1. `npm run lint`: JavaScript/React checks.
2. `npm test`: compile and run contract, service, mock, and configuration-warning checks.
3. `npm run build`: production frontend compilation.
4. `npx playwright install chromium`, then `npm run test:browser`: local UI regression.
5. Complete the independent checklist below with real MetaMask; record observations and
   screenshots during Milestone 5, including any differences from the adapter.

The CI workflow is `.github/workflows/ci.yml`, workflow `CI`, job `verify`. It installs
pinned packages, runs lint, tests, build, ABI consistency, and browser checks. Repository
branch protection and a green hosted run must be independently confirmed to close the instructor's priority feedback before Milestone 4.

## Feature and risk coverage

| ID | Scenario and expected result | Verification |
| --- | --- | --- |
| M4-01 | Reject zero/duplicate/overlapping members, invalid thresholds, limits and delays; accept valid configuration | Contract suite; real wallet-creation service test |
| M4-02 | Create two treasuries; deposits, proposals, votes, recoveries and balances belong only to the selected contract | Service discovery/isolation test; browser creates and switches treasuries |
| M4-03 | Payment proposer counts once; other current owners approve; outsiders and duplicate votes fail | Contract/service tests; multi-account browser flow |
| M4-04 | No execution before quorum or unlock; readyAt-1 fails, readyAt succeeds; execution cannot replay | Exact contract boundaries; browser disabled execution and successful flow |
| M4-05 | Pending approval revocation works; queued revocation fails; cancellation needs N-M+1 live owners | Contract tests; browser payment cancellation |
| M4-06 | Expiry is inclusive at expiresAt, expired only after it; expired requests cannot execute | Contract boundaries; browser Expired state |
| M4-07 | Current per-payment cap, daily cap, UTC-day reset, balance and recipient acceptance are enforced at execution; failed transfers roll back accounting | Contract tests, including reverting and reentering receivers |
| M4-08 | Governance actions require current owner quorum and the originally queued governance delay; invalid encoded actions fail | Contract and service tests; AddOwner browser flow |
| M4-09 | Quorum loss blocks queued execution; restoring quorum preserves readyAt; removed/readded owner approvals and cancellation votes do not revive | Contract regressions |
| M4-10 | Guardians reach K, wait, and replacement confirms; only one owner seat changes; funds stay unchanged | Contract/service tests; browser recovery execution |
| M4-11 | Target veto and M-other-owner recovery veto cancel requests; target cannot count as an other-owner vote | Contract tests; both browser cancellation routes |
| M4-12 | Removed/readded guardian votes do not revive; changed K is rechecked; new votes preserve the original recovery timer | Contract regressions |
| M4-13 | Owner removal/replacement/readdition invalidates the original recovery target; display Invalidated, explain why, disable execution and preserve cancellation | Generation-aware contract view; real service regression; browser invalidation/cancellation; manual UI checklist |
| M4-14 | New governance/recovery members discover factory wallets in a fresh session; removed members are filtered; manual addresses remain usable | Real service test, without shared browser storage |
| M4-15 | M=1, M=N and K=G warnings describe unilateral control, unavailable other-owner veto and missing guardian redundancy | Configuration-warning unit test; browser M=1 warning; manual settings review |
| M4-16 | Rejected signatures display a recoverable error without changing funds; account/network changes invalidate transaction reviews | Service tests; browser rejected deposit; manual MetaMask checklist |
| M4-17 | Events, new blocks, tab focus and 30-second fallback refresh authoritative state, including changes while disconnected | Implemented subscription paths; manual reconnect/outage scenarios below |
| M4-18 | Random payment sequences preserve quorum, delay, at-most-once execution and outflow accounting | Seeded fast-check contract test; broader mutation fuzzing planned for M5 |

## Independent grading checklist: 3 owners, 2 guardians

Use accounts printed by `npm run chain`, numbered from zero. Keep the default demo wallet
for comparison. Do not reuse these public development keys outside the local chain.

1. Run compile/deploy as above and open http://127.0.0.1:5173. Confirm chain ID 1337 in
   MetaMask and that the selected contract matches `public/deployments/1337.json`.
2. Connect account 0. In Create wallet, enter owners 0, 1, 2; owner threshold 2;
   guardians 5, 6; guardian threshold 2. Keep default limits/delays. Confirm the warning
   that both guardians are required, then review and create. Record the new address.
3. Deposit 1 ETH. Create a 0.1 ETH payment to account 9. Check 1/2 approvals and disabled
   execution. Switch to owner 1 and approve. Check queued state, still-disabled execution,
   then Ready after 15 seconds. Execute; balance must be 0.9 ETH, recipient receives 0.1 ETH.
4. Create another payment. Owners 0 and 1 vote to cancel. Check Cancelled and disabled
   execution. Create another, leave pending, and later verify Expired after the configured
   proposal TTL (automated tests advance chain time instead of waiting a day).
5. Guardian 5 initiates recovery of owner 2 to account 8. As owner 2, cancel directly.
   Repeat recovery. Guardian 6 approves. Owners 0 and 1 vote to cancel it; check Cancelled.
6. Repeat once more; guardians 5 and 6 approve, replacement 8 confirms, wait 180 seconds,
   and execute as 8. Owner 2 disappears and owner 8 appears. Funds remain 0.9 ETH.
7. Switch between this wallet and the original demo wallet. Check separate balances and
   request histories. Test account 8 in a fresh browser session: it discovers this wallet.
8. On a fresh scenario, initiate recovery, then execute a governed ReplaceOwner targeting
   that seat. The stale request must display Invalidated, explain the membership change,
   and disable execution. Cancellation remains possible until expiry. The obsolete target
   address can cancel directly even after removal, as allowed by the existing contract.
9. Preview M=1 and M=N governance settings and check warnings before signing. Verify
   that M=N disables the unreachable other-owner recovery-vote route. Revert demo settings
   through governance or reset the chain afterwards.
10. Stop/restart the chain to reset: stop the process, run `npm run chain`, then
    `npm run deploy`, reload the app, and reset MetaMask local account activity if needed.
    Previously recorded addresses/manifests must not be treated as persistent deployment proof.

## Milestone 5 integration campaign (original plan)

The [developer guide](DEVELOPER_GUIDE.md#checks-and-reproducible-evidence) describes
the current automated campaign and saved test evidence. The original campaign
below is retained to show its intended scope; it must not be read as a claim that
all manual checks passed.

- Complete real MetaMask tests with fresh profiles, denied site permissions, account changes
  while reviewing/signing, wrong networks, dropped RPC connections and reconnects. Change
  contract state from another browser while disconnected; verify the full reread afterwards.
- Exercise every UI terminal state, all governance forms, replacement-address conflicts,
  unreachable guardian quorum, compromised-owner veto, and M=N cancellation limitations.
- Run governance/recovery adversarial sequences under multiple independent signers and
  varied configurations; include role changes during pending, queued and ready states,
  daily-cap contention, changes to delays/tiers, and recovery cancellation vote generations.
- Record test environment, revision, inputs, expected/actual results, screenshots, defects,
  fixes and reruns in an integration results report. Add coverage measurement rather than
  inferring percentage coverage from test counts. Keep security limitations explicit.
- Review the code as a team, confirm branch protection and hosted CI, then prepare and
  perform public-testnet deployment, source verification and realistic gas/timing checks.
- Define acceptance thresholds before testing: no unresolved blocker in payment/recovery,
  all planned required scenarios pass, and every deferred issue has an owner and rationale.

## Boundaries and known limitations

A quorum that cannot sign cannot be recreated by software. Lost guardian access can be
repaired by owner governance only while owner quorum exists. A stolen target key can veto
guardian recovery; a remaining owner quorum must use ReplaceOwner. If neither route is
available, funds can remain locked. The UI explains this instead of adding an administrator
or emergency bypass. Members must monitor requests during timelocks.

Factory discovery scans creation events and checks current membership. This is suitable
for the course-sized local dataset; large deployments need indexing/caching and RPC/reorg
engineering. One-confirmation UX, exhaustive fuzzing, production finality, public deployment,
external auditing, and final reports are not delivered by this M4 checkpoint.


## Public testnet verification

Deployment is a manual, one-time command. Verification is automated and read-only: the
GitHub Pages workflow runs `verify:deployment -- --network sepolia` before publishing
(bytecode against the current build, record consistency, wallet provenance, and Etherscan
source when `ETHERSCAN_API_KEY` is set). test/explorer.test.mjs covers the Etherscan client
with mocked responses. Signing flows on Sepolia are checked manually with MetaMask (docs/DEMO.md).

## Added M4 adversarial and warning coverage

See SECURITY_SCENARIOS_M4.md for the additional deterministic multi-signer scenarios and warning previews. These add explicit collusion, liveness, membership-race and daily-cap contention cases. They do not establish arbitrary governance/recovery fuzz coverage, actual MetaMask/RPC outage acceptance or a coverage percentage. The instructor feedback lists verified public deployment and enforced CI gates as priorities before M4; retain actual hosted results separately rather than assuming local success closes those items.
