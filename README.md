# DAMD Treasury - Milestone 2 prototype

CSE 416. Team: Daniel Zhou, Daniel He, Alex Tran, Matthew Chang.

This is an educational local-EVM prototype, not an audited wallet. Use disposable local test funds only. Guardian recovery is specified in the accompanying design document but is not implemented here.

## Requirements

Node.js 22.12+ and npm. MetaMask is needed for the manual browser demo. Use a dedicated test browser profile. No API keys, production wallet secrets, backend database, or external RPC subscription are required.

## Run on Windows, macOS or Linux

Open a terminal in this `prototype` folder:

```sh
npm ci
npm run lint
npm test
npm run build
npm run chain
```

Keep the chain terminal open. In a second terminal in the same folder:

```sh
npm run deploy
npm run dev
```

Open http://127.0.0.1:5173. Add a custom MetaMask network with RPC URL http://127.0.0.1:8545, chain ID 1337, currency symbol ETH, and name DAMD Local. Import accounts 0 and 1 using ONLY the public disposable development keys printed by `npm run chain`. Those accounts are two of the three configured owners. Never send real funds to these addresses. The application itself never requests, receives or stores these keys.

Deployment creates a 2-of-3 wallet, a 1 ETH per-payment cap, a 15-second timelock and a starting balance of 5 test ETH. It writes the public ABI, addresses and chain ID to `public/deployment.json`.

## Demo (about 4 minutes)

1. Connect account 0. Show the balance, approval threshold, limit and contract address.
2. Deposit 1 test ETH. Wait for confirmed status. The balance becomes 6 ETH.
3. Propose 0.1 ETH to the prefilled account 4 recipient. Creating a proposal does not count as an approval.
4. Approve with account 0. Show 1/2 and the disabled Execute button.
5. Switch to account 1 in MetaMask and connect again. Approve the same proposal. Show 2/2 and Timelocked.
6. Wait at least 15 seconds. The next chain snapshot changes the state to Ready. The local node mines every second. The UI uses chain time, not the computer clock.
7. Execute with either owner. Show Executed and the updated balance. A second execution cannot succeed.
8. Propose 1.1 ETH. Show the contract's rejection. Switch to account 3 to show that an outsider cannot propose or approve.
9. Point out the Social recovery section, which is explicitly design-only.

## Commands and files

- `contracts/Treasury.sol`: contract state and authorization.
- `src/walletService.js`: ethers adapter/facade, read snapshots and write methods.
- `src/app.js`: React dashboard, forms and transaction feedback.
- `scripts/compile.mjs`: pinned Solidity compiler, Shanghai EVM target.
- `scripts/chain.mjs`: disposable local Ganache blockchain.
- `scripts/deploy.mjs`: deploy and fund the local treasury.
- `test/treasury.test.mjs`: automated EVM tests using Node's test runner.
- `.github/workflows/ci.yml`: push/PR lint, compile, tests and frontend build.

## Prototype limits

No recovery, owner additions/removals, approval revocation, cancellation, tokens, factory, proxy, testnet deployment or production security audit. The payment delay is fixed. The full design's amount/owner-count policy is future work. Approval history comes from contract storage. A 4-second read poll refreshes the dashboard. Event subscriptions and missed-event backfill are future work. It loads every proposal and is intended for small classroom demos. MetaMask extension interaction needs a manual rehearsal; automated browser launch was blocked in the authoring environment.

The per-payment limit does not impose a daily budget: several individually valid payments can exceed that amount in total. The interface reports pending status immediately; mining and human signing have no five-second guarantee.

Ganache may report an unavailable native uWS binary on newer Node releases, then use its JavaScript fallback. It is pinned for this reproducible classroom demo. It is a legacy development tool, not the proposed long-term deployment platform. Dependencies need review before use beyond this local exercise.

The lockfile marks Ganache's nested macOS-only fsevents dependency as optional so `npm ci` also works on Linux CI. Preserve this flag when regenerating the lockfile.

## Troubleshooting

- Contract missing or stale state after restarting the chain: run `npm run deploy` again and reload. In the dedicated MetaMask test account, clear activity/nonce data if needed.
- Wrong network: select chain 1337. The write service checks the chain before signing.
- No MetaMask: the dashboard still supports read-only viewing, but signing actions require the extension.
- Port in use: stop the previous local node or Vite instance. Start all commands on the same machine.
- Rejected signature or reverted transaction: read the status message. The application does not label a failed transaction successful.

## GitHub setup (team action)

Copy the CONTENTS of this folder into the root of the team's repository so `.github/workflows/ci.yml` is at repository root. Commit package-lock.json. Do not commit node_modules, .env or private keys.

```sh
git init
git add .
git commit -m "Add Milestone 2 treasury prototype and CI"
git branch -M main
git remote add origin YOUR_TEAM_REPOSITORY_URL
git push -u origin main
```

The placeholder above must be replaced by the actual repository URL. Invite the four team members using the emails in the design document. Enable a ruleset for main requiring pull requests, one approving review, and the `verify` CI check. Open a PR and retain a successful Actions run URL or screenshot for submission. Hosting, teammate invitations and rulesets were not configured by this package.

## Attribution

Prepared with AI assistance. The team must review the generated code and design, understand the demo, and disclose assistance according to the course policy. This package does not claim that any member has already implemented or reviewed a particular part.
