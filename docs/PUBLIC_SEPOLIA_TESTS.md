# Public Sepolia security acceptance

The existing team treasury and Pages site use a persistent deployment. The separate
**Public Sepolia acceptance** workflow deploys disposable contracts and runs security
scenarios against them. It never updates the team's committed deployment records or
publishes over the team's site. There is no user or fund migration for these tests.

## What is automated

An operator starts the workflow deliberately to control faucet usage. After that click,
deployment, funding temporary signing accounts, functional checks, source verification,
frontend checks and evidence collection are automated. This workflow does not redeploy
on every commit. Existing ci.yml and pages.yml continue to serve their current purposes.

The workflow first runs Node tests and an isolated local rehearsal without deployment
secrets. Then the Sepolia job creates a new factory and two treasuries, checks runtime
bytecode, and sends real public transactions with separate signers. The scenarios cover:

- Deposit and payment delivery with an exact recipient balance change.
- Rejection below owner quorum, before the timelock, and after a payment was executed.
- Distinct-owner approval, cancellation and governed owner changes.
- Guardian quorum, replacement confirmation and execution of social recovery.
- Direct recovery cancellation by the target and quorum cancellation by other owners.
- A recovery made invalid by an owner membership change, followed by cancellation.
- Discovery by a newly added owner with empty browser storage.
- Isolation of the second treasury's balance, members and requests.

Expected rejections use eth_call against the deployed public contracts and require the
specific contract error. Successful actions send transactions and check confirmed receipts,
balances, membership, request status and events. Public delays wait for real block time;
only the explicitly local rehearsal can advance its test clock.

All three new contracts must have verified sources on Etherscan. A production build then
reads the new deployment via the public browser RPC and checks balances, owners, request
counts, history and wallet isolation. Browser checks do not sign through MetaMask; the
transaction runner uses independent temporary signers. Keep the existing human MetaMask
demo as separate acceptance coverage.

## One-time settings

In repository Settings → Secrets and variables → Actions, configure:

| Location | Name | Value |
| --- | --- | --- |
| Secret | SEPOLIA_RPC_URL | HTTPS Ethereum Sepolia RPC, chain 11155111 |
| Secret | ETHERSCAN_API_KEY | A valid Etherscan API key |
| Secret | DEPLOYER_KEY | Private key of a funded CI-only test account |
| Variable | SEPOLIA_BROWSER_RPC_URL | Public, CORS-enabled Sepolia RPC; for example https://ethereum-sepolia-rpc.publicnode.com |

Repository secrets work for this workflow. If you also define a secret with the same
name in the sepolia environment, that environment value takes precedence. Never paste
keys into source, issues, screenshots or chat. Account credentials remain exclusively in
GitHub secrets; temporary signer keys stay in the runner's memory.

The default per-run deployer spending ceiling is 0.1 test ETH, with a 10 gwei fee cap and
two confirmations. The ceiling is not a minimum required balance: preflight calculates
a conservative estimate using current fees and checks the actual account balance before
any writes. Failures may still consume test ETH after transactions have begun. Temporary
signer keys are discarded and their remaining gas funds are not recovered. The generated
wallets are test fixtures, not persistent team wallets.

## Run and review

1. Merge the workflow and scripts onto main using the team's normal review process.
2. Open Actions → Public Sepolia acceptance → Run workflow, select main, and start it.
3. Let rehearse finish, followed by Deploy and verify public Sepolia. Timelocks,
   transaction confirmations and explorer queues can take several minutes.
4. Require a green public job. Download sepolia-evidence-RUN_ID from the run page.
5. In evidence.json, require mode public, chainId 11155111 and status passed. Check
   three sourceVerification entries, frontend.status passed and the receipt/explorer links.

Local rehearsal success alone is not public evidence. This delivery has not itself sent
Sepolia transactions. A failed or skipped public job does not establish completion.
The frontend artifact is the app tested for the disposable deployment; it is not deployed
to Pages. The team's normal manifests remain in deployments/ and public/deployments/.

## Local rehearsal

Install dependencies and Playwright Chromium, then run:

    npm run test:sepolia:rehearse

It creates a separate local chain on port 18545, an isolated app under test-results/,
and checks that all four original deployment manifests remain byte-for-byte identical.
It shares the transaction and frontend assertions with public mode. It does not call
Etherscan or substitute local results for a public run.

For a public CLI run with your credentials configured locally, use this sequence:

    npm run test:sepolia
    npm run test:sepolia:build
    npm run test:sepolia:ui
    npm run test:sepolia:summary

Partial reports, public receipts and screenshots are saved under test-results/sepolia/.
