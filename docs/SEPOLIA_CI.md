# Automated Sepolia deployment and public acceptance

## Current status

The CI automation, transaction checks, explorer verification client and frontend checks are
implemented. The shared transaction journey and production frontend have passed an isolated
local rehearsal. A real Sepolia run has NOT been performed in this delivery: the funded
account, RPC access and explorer API key must be configured by the repository owner.

Do not mark the feedback item complete merely because this code exists or the local CI job
is green. Completion requires a successful **Deploy and verify public Sepolia** job and its
public evidence artifact with `status: passed`, `mode: public`, and `chainId: 11155111`.

## What CI does

1. The existing `verify` job runs lint, compilation, all Node tests, build, ABI consistency,
   the local browser walkthrough and the new isolated deployment/frontend rehearsal.
2. The `sepolia` job waits for `verify`. It runs only on trusted `main` push/manual events,
   never on pull requests. A concurrency group serializes deployments from the CI account.
3. A dedicated funded Sepolia deployer creates a factory. The run generates six distinct
   temporary signing accounts in memory, funds their gas within a bounded budget, and creates
   two independent 3-owner/2-guardian treasuries with a 2-owner and 2-guardian quorum.
4. Checks compare on-chain runtime bytecode with this exact compiler build, masking only
   compiler-declared immutable slots. Creation-block checks validate the immutable block values.
5. Real signed public-network transactions exercise deposit, proposal, distinct-owner approval,
   payment execution, cancellation, governance, guardian recovery, replacement confirmation,
   direct and multi-owner recovery vetoes, stale recovery invalidation and cleanup. Balance,
   current membership, request status, event and wallet-isolation assertions must pass.
6. Negative quorum/replay checks use `eth_call` against deployed contracts. The early-execution
   check uses the actual confirmed quorum block, preventing RPC latency from hiding the early
   state. Public timelocks wait for real block timestamps; no public path calls `evm_*`.
7. Etherscan V2 receives the complete standard JSON compiler input and original constructor
   arguments for the factory and both treasury instances. CI waits for verification and checks
   published source/compiler metadata. A verification failure fails the job.
8. CI builds the frontend for chain 11155111 and the generated deployment manifest. A browser
   checks public read-only state, owners, balances, requests, activity and second-wallet isolation.
   This does not claim automated MetaMask-extension signing. Transactions are independently
   signed by the Node runner; the browser reads the resulting real public state.
9. CI uploads evidence, receipts/links, compiler input, screenshots and deployment manifests.
   After complete success it also uploads the frontend built for that deployment.

## One-time setup in GitHub

Use the repository `PlasmaZero/damd-treasury-wallet`.

### 1 Put the updated code in the repository

Extract the updated project ZIP. Copy its contents into the repository root so that
`.github/workflows/ci.yml`, `scripts/`, `contracts/` and `package.json` are directly at the
root, rather than inside another nested folder. Include dotfiles and the generated treasury
ABI. Use a feature branch and review/merge the changes to `main` through your normal process.

The ZIP includes the M4 recovery-validity implementation that the acceptance flow calls.
Copying only the workflow onto the older M3 contracts is insufficient.

### 2 Prepare a dedicated test account

Create a separate Ethereum account for CI and fund it with Sepolia ETH. Do not use the
public deterministic keys printed by the local Ganache script, a personal mainnet key or a
team treasury owner key. Use an official Ethereum network/faucet reference for test funds.

The default run budget is 0.1 Sepolia ETH and the maximum allowed quoted fee is 10 gwei.
The script requires enough balance for a conservative estimate before deploying, checks a
spending bound before every deployer transaction, and tops up temporary signer gas only
within that same budget. Actual usage varies. If preflight reports a budget/fee problem,
wait for lower fees or deliberately adjust the documented workflow limits. A failed public
run can still consume gas or leave deployed test contracts; it is not rolled back globally.

Temporary signer keys stay in process memory and are never written to artifacts. Remaining
balances on these disposable accounts are not recovered. The generated treasuries are marked
`automatedTestFixture`; do not treat them as persistent team treasuries or deposit extra funds.

### 3 Add the environment secrets

In GitHub, open the repository's Settings, then Environments. Create an environment named
`sepolia`. Restrict its deployment branch to `main` where available. Add these environment
secrets (do not commit them or paste them into chat):

| Secret | Value |
| --- | --- |
| `SEPOLIA_RPC_URL` | HTTPS RPC endpoint for Sepolia, chain 11155111. |
| `DEPLOYER_KEY` | Private key of the dedicated funded Sepolia test account. |
| `ETHERSCAN_API_KEY` | Etherscan V2 API key permitted to verify Sepolia contracts. |

Secrets are exposed only to the deployment/check step, after the local verification job.
The package-install and pull-request test steps do not receive these secrets.

### 4 Add the public browser RPC variable

In Settings, Secrets and variables, Actions, open Variables and add a REPOSITORY variable:

- Name: `SEPOLIA_BROWSER_RPC_URL`
- Value: an HTTPS Sepolia RPC endpoint that permits browser CORS and JSON-RPC batch requests and is suitable
  for public frontend use. Any credential in this URL becomes public in the frontend build.
  Use a restricted public client endpoint, rather than copying a private server credential.

The separate private `SEPOLIA_RPC_URL` is never embedded in the frontend by this workflow.
Both endpoints must resolve to Sepolia. The browser check confirms the public endpoint's
chain ID and deployed runtime hash before inspecting the actual interface.

### 5 Start the first public run

1. Merge the reviewed code into `main`.
2. Open Actions and select the `CI` workflow.
3. Choose Run workflow on `main` with `deploy_sepolia` checked.
4. Wait for `verify`, then `Deploy and verify public Sepolia` to finish.
5. Public blocks, confirmation waits and explorer indexing take time. Run this before
   class, not during a 12-minute presentation. The public job has a 60-minute timeout.

For automatic deployment after subsequent pushes to `main`, add another REPOSITORY variable:
`SEPOLIA_DEPLOY_ENABLED` = `true`. Leave it unset/false until ready to spend test gas on main
pushes. Manual dispatch does not require this opt-in variable. Running a feature-branch or
pull-request check does not deploy or use the testnet secrets.

## What a successful public result must contain

Open the completed run. The public deployment job must be successful, not skipped. Download
`sepolia-evidence-<run id>-<attempt>` and inspect `test-results/sepolia/evidence.json`:

- `mode` is `public`, `chainId` is `11155111`, and final `status` is `passed`.
- `revision` and `runUrl` identify the tested GitHub commit/run.
- `factory` and both entries in `wallets` contain actual addresses and runtime hashes.
- Each successful transaction has a hash, block/hash, gas used, gas price and duration.
- The checks include payment balance changes, recovery, cancellation, discovery, invalidation
  and independent wallet state. Required negative cases report successful contract-error checks.
- All three `sourceVerification` entries say `verified` and link to explorer code pages.
- `frontend.status` is `passed`; screenshots show the real deployed public state.

Open transaction and contract links in the explorer to independently inspect the public
records. Source verification establishes correspondence with source; transaction assertions
establish the tested functional behavior. Neither is an external security audit.

If a stage fails, the job fails and uploads available partial evidence. For example,
`functional-checks-passed` or `contract-and-source-checks-passed` is NOT the final acceptance
result. A green `verify` job alone is local evidence, not public deployment proof.

## Commands and evidence

| Command | Purpose |
| --- | --- |
| `npm run check` | Lint, compile/tests and frontend build. |
| `npm run test:sepolia:rehearse` | Isolated local transaction and production-UI rehearsal. Requires installed Playwright Chromium; no public credentials. |
| `npm run test:sepolia` | Deploy, transact and verify source on public Sepolia. Uses the four configured environment values. Spends test ETH. |
| `npm run test:sepolia:ui` | Check the production frontend after a successful public contract/source run and Sepolia build. |
| `npm run test:sepolia:summary` | Summarize the evidence for the GitHub Actions run. |

For a local public run, put the three secrets plus `SEPOLIA_BROWSER_RPC_URL` in a gitignored
`.env`, run `npm run test:sepolia`, build with `VITE_USE_MOCK=false`,
`VITE_CHAIN_ID=11155111` and `VITE_RPC_URL` set to the public browser endpoint, then run
`npm run test:sepolia:ui`. The CI workflow automates all these steps.

The frontend artifact is a ready-to-serve static build tied to the deployment. This workflow
does not publish a hosted website. Download and serve it with an appropriate static server,
or publish it through a separate hosting process. To demonstrate human signing on Sepolia,
create a separate treasury with your funded test accounts using the deployed factory and
complete the real MetaMask checklist. The automated fixture's temporary signer keys expire
with the CI process.

## Remaining scope

Implemented automation and passing local rehearsals are distinct from an executed public
acceptance run. Once configured, CI supplies the missing deploy/source/function evidence.
Real MetaMask acceptance, broader governance/recovery adversarial coverage, RPC outage/reorg
handling, hosted branch-protection evidence and any independent security audit remain separate
requirements. Milestone 6 final release and retrospective are unaffected.

## Primary references

- GitHub deployment environments and concurrency: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
- Etherscan V2 source verification: https://docs.etherscan.io/api-reference/endpoint/verifysourcecode
- Etherscan verification polling: https://docs.etherscan.io/api-reference/endpoint/checkverifystatus
- Verified source retrieval: https://docs.etherscan.io/api-reference/endpoint/getsourcecode
- Ethereum networks and testnet resources: https://ethereum.org/en/developers/docs/networks/
