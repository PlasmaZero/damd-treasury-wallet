# Milestone 4 implementation notes

## Delivered at this checkpoint

The full local feature set remains: independent treasuries, deposits, M-of-N payments,
tiered delays, spending caps, proposal cancellation, governed membership/rule changes,
guardian recovery with replacement confirmation, and event history.

M4 adds generation-aware recovery validity in the UI, warnings for valid but risky
threshold settings, discovery for members added after creation, and focused regression
checks. `TEST_PLAN.md` documents feature coverage and the later integration campaign.
`ARCHITECTURE.md` defines the queued-state semantics and recovery limitations.

## Interface and design choices

- `isRecoveryTargetCurrent(uint256)` is an additive read-only contract view. Existing enum
  numbers, transaction methods and event formats are unchanged. Regenerated frontend ABIs
  are included. New local contracts must be deployed; old immutable M3 wallets cannot be
  upgraded. No proxy, administrator, or emergency spending path has been added.
- Invalidated is a frontend label, not a new Solidity status. It means that an otherwise
  active request targets a removed/replaced owner generation and can never execute for
  that generation. Its on-chain Pending/Queued status and expiry stay intact; cancellation
  remains possible. A replacement-address membership conflict is displayed as a separate
  temporary blocking reason rather than permanent invalidation.
- Valid low thresholds remain allowed. Visible warnings explain their consequences rather
  than silently changing the course specification's accepted configurations.
- Discovery scans the configured factory's WalletCreated events and checks current members.
  This avoids changing immutable factory membership indexing and works in fresh browsers.
  Wallets from other factories can still be added by address. An indexer is deferred.
- Recovery cannot solve simultaneous loss of both owner and guardian quorums. It also cannot
  override a stolen target key's direct veto; owner governance is the alternative when an
  owner quorum remains. These constraints are visible in the interface.

## Presentation preparation

Use `DEMO.md` and the independent 3-owner/2-guardian checklist in `TEST_PLAN.md` to demonstrate
payments, cancellation, governance, recovery, and the new warnings/invalidated state.
Explain the immutable-contract tradeoff, preserved original timelocks, current-rule execution
checks, generation-aware votes, and lack of an emergency bypass. Present the testing and
integration work as a plan where not yet run. This package does not include a slide deck.

## Reserved for later milestones

Milestone 5: systematic integration test results, recorded defects/fixes, actual MetaMask
acceptance, hosted CI/branch-protection evidence, public-testnet deployment/verification,
deployment plan and draft final user/developer guides.

Milestone 6: final acceptance/release, finalized repository and documentation, final demo,
project retrospective, and final written report including AI use.

Focused checks performed while developing this checkpoint do not constitute completion
of those later milestones. Do not present inherited validation notes as new results.


## Public deployment feedback followup

Public deployment verification is automated in the GitHub Pages workflow: before each
publish, `verify:deployment` compares the deployed runtime bytecode with the current build,
checks the deployment record and wallet provenance, and (with `ETHERSCAN_API_KEY`) confirms
Etherscan source verification. Deployment itself stays a manual, one-time command; see the
README's Public deployment section and docs/DECISIONS.md for why CI does not deploy.
