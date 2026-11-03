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


## Public testnet validation

Sepolia contracts are deployed once, manually, with `npm run deploy -- --network sepolia`;
CI holds no deployer key and sends no transactions. Validation of the public deployment is
automated and read-only: `npm run verify:deployment -- --network sepolia` runs before every
GitHub Pages publish and blocks it unless the committed record matches the chain (runtime
bytecode equals the current build, factory block and wallet provenance match, and, with
`ETHERSCAN_API_KEY`, source is verified). The Etherscan client is covered by mocked unit tests
in test/explorer.test.mjs. Results of a real run are visible in the Pages workflow log.


## Final Milestone 4 demo test inventory

This package contains 66 named Node tests: 34 original contract tests, 9 adversarial contract scenarios, 10 service/mock tests, 5 warning/preview tests, and 8 explorer-client tests. The earlier total of 43 describes the feature checkpoint before the explorer-client tests were added. Compared with the original M3 ZIP supplied for this project (29 contract and 5 service tests), the increase is 32 named tests.

The Playwright browser walkthrough runs separately with npm run test:browser. It covers multiple scenarios and desktop/mobile layouts; it is not included in the count of 66. Explorer-client tests use mocked API responses. Local browser tests use a local chain and a wallet adapter, rather than the actual MetaMask extension.

This demo ZIP preserves the team's manual Sepolia deployment and Pages verification. It excludes PR #9 and the separate disposable public-testnet acceptance workflow. These counts identify implemented tests, rather than asserting a new execution of this ZIP's full suite.

## Expanded security validation - November 3, 2026

All 66 named Node tests passed in two non-overlapping groups: 24 security/warning/service tests and 42 existing treasury/explorer tests. Zero failures or skips were reported. Lint, Solidity compilation, and the production frontend build passed. The full Playwright browser walkthrough passed, including the newly added single-guardian, proposed guardian-removal and proposed owner-removal warnings, existing security flows, desktop and mobile layout checks.

Contracts, ABI JSON and all committed deployment records were compared byte-for-byte against the previous M4 demo ZIP and are unchanged. No public Sepolia transaction was sent for these tests. No hosted CI success, source-verification success, coverage percentage, actual MetaMask extension acceptance or independent security audit is claimed. PR #9 is excluded.
