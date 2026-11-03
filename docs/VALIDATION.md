# Milestone 4 developer validation

Checked locally on 2026-11-02, Windows, Node.js 24.14.1 and npm 11.11.0.
This record replaces the inherited M3 validation claims for this checkpoint.
It records focused development checks, not the Milestone 5 integration results report.

- Pinned dependencies installed with `npm ci --no-audit --no-fund`.
- `npm run lint`: passed on the final source.
- Solidity 0.8.24, optimizer 200, EVM paris: compilation passed. Treasury runtime is
  17,766 bytes and factory runtime is 22,232 bytes, below the 24,576-byte limit.
- All 34 contract tests passed, including the five new governance/recovery regressions.
- All 8 service/mock tests passed across affected-suite and targeted reruns. A discovery
  test initially failed because the test adapter overwrote another subscriber's account
  listener. The adapter now supports multiple subscribers; the affected service suite passed.
- The configuration-warning/veto eligibility test passed, including the distinction between
  a current recovery target and one that has already left membership.
- Total Node checks verified: 43 (34 contract, 8 service/mock, 1 configuration warning).
  The above results include a full run followed by targeted reruns after test-harness fixes;
  they do not claim that the first `npm run check` invocation passed.
- `npm run build`: passed on the final frontend.

- `npm run test:browser`: final run passed. It exercised payment execution, governance,
  guardian recovery execution, a second treasury created in the UI, low-threshold warnings,
  rejected-signature retry, treasury isolation, payment cancellation/expiry, both recovery
  cancellation routes, invalidated recovery display/disabled execution/direct cancellation,
  activity history, desktop rendering and 390px mobile layout without horizontal overflow.
  Screenshots were visually inspected. This used the local EIP-1193 adapter, not MetaMask.
  Test selectors were corrected during development; the final complete browser run passed.

The Ganache native uWS module is unavailable for this Node version and falls back to its
JavaScript implementation. No dependency versions were changed to suppress that warning.

The actual MetaMask extension, public Sepolia deployment, source verification, real-world
gas/timing, hosted GitHub Actions and repository protection settings have not been validated
for this checkpoint. They remain in the integration plan in TEST_PLAN.md. No security audit,
coverage percentage, final acceptance or final release is claimed.


## Automated public testnet followup validation

Checked locally on November 2, 2026 with Node.js 24.14.1 and npm 11.11.0.
`npm run check` passed with all 51 named Node tests, zero failures, plus lint, compilation
and the production frontend build. The 8 added automation tests cover the shared acceptance
journey, bytecode/network/budget guards and explorer success/failure/retry behavior.

`npm run test:sepolia:rehearse` also passed: an isolated chain deployed two fresh treasuries,
executed the complete multi-signer journey, built an isolated production app, and checked
balances, members, request counts, event history and second-wallet isolation in Chromium.
The normal local deployment manifests were preserved. The workflow YAML and job gates were
parsed successfully. Explorer responses were mocked only in the unit tests.

No real Sepolia transactions or Etherscan verification were performed during this delivery.
The scripts and CI job are ready, but public acceptance remains pending repository setup and
a funded test account. Only a real `sepolia` job with public evidence status `passed` counts
as public verification. Setup and exact proof requirements are in SEPOLIA_CI.md.

The final rehearsal also refreshed fees per transaction and exercised bounded temporary-signer
gas top-ups. The automated run limits remain enforced before each deployer transaction.
