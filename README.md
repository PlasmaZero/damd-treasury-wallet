# DAMD Treasury Wallet

A complete **local test-fund MVP** for the DAMD shared treasury project: React +
ethers.js + MetaMask, backed by immutable Solidity contracts. This replaces the
Milestone 2 deposit-only prototype. It is not audited and must not hold real funds.

## What works

- Create multiple treasury wallets with independent members and rules.
- Connect MetaMask, read balances, deposit test ETH, and switch accounts.
- Propose payments, collect M-of-N owner approvals, wait for a timelock, and execute.
- Enforce per-payment and fixed UTC-day spending caps at execution.
- Revoke pending approvals; cancel pending or queued proposals with N − M + 1 votes.
- Change owners, guardians, thresholds, caps, and delays through governed proposals.
- Recover a lost owner address with guardian quorum, delay, and new-account confirmation.
- Cancel recovery directly as the targeted owner or through M other owner votes.
- View proposals, per-member votes, recovery requests, and event history.
- Preview transactions before signing; display submission hashes, confirmations, and errors.
- Refresh from contract state on blocks, events, account/network changes, tab focus, and a five-second fallback timer.
- Run a clearly labeled mock mode without MetaMask or a blockchain.

There is no custom backend, database, proxy upgrade key, or privileged team administrator.

## 1. Install

Use **Node.js 22.12 or later**, npm, and the MetaMask browser extension.
The project was checked with Node 24.19; CI uses Node 22.

```sh
npm ci
```

Do not run `npm audit fix --force`: it can change the frozen toolchain. Ganache is
legacy development tooling required by this story specification. Its native uWS
warning on newer Node versions falls back to JavaScript and does not stop the chain.

## 2. Start the local blockchain

Terminal 1, in the folder containing `package.json`:

```sh
npm run chain
```

Keep this terminal open. The chain mines every two seconds, so timelocks advance
without needing another transaction. It prints 12 **public disposable test accounts**.
Never use these accounts on a network holding real value.

| Accounts (zero-based) | Role in the default demo wallet |
| --- | --- |
| 0–4 | Five owners, requiring three approvals |
| 5–7 | Three guardians, requiring two approvals |
| 8 | Replacement owner for recovery demonstrations |
| 9 | Payment recipient |
| 10–11 | Extra accounts for governance / unauthorized-user tests |

## 3. Deploy and start the website

Terminal 2, in the same folder:

```sh
npm run deploy
npm run dev
```

Open **http://127.0.0.1:5173**. Deployment compiles automatically, deploys the
factory, creates the demo treasury, and writes its public deployment record.
The treasury starts with **0 ETH**. Account balances and treasury balances are separate.

## 4. Connect MetaMask

Add a custom network with these values:

| Setting | Value |
| --- | --- |
| Network name | DAMD Local |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 1337 |
| Currency symbol | ETH |

Import the development private keys printed by Terminal 1 **into MetaMask only**.
For a full demo, import accounts 0, 1, 2, 4, 5, 6, and 8. The website never asks for a key.
Select DAMD Local, select owner account 0, and click **Connect MetaMask**.
When switching accounts, ensure MetaMask grants the site access to the selected account.
If the website still shows an old account, reconnect and check the site's MetaMask permissions.

## 5. Try a payment

1. On Overview, deposit **1 ETH** from owner 0.
2. On Proposals, enter account 9's address and **0.1 ETH**. Review and sign.
3. The proposal starts with **1/3 approvals**: the proposer automatically approves.
4. Switch MetaMask to owner 1, then Approve. Repeat with owner 2.
5. After the third approval, wait **15 seconds**. The status changes to Ready.
6. Click Execute as an owner, review, and sign. The treasury balance becomes **0.9 ETH**.

Approval and execution are separate transactions. MetaMask account switches do not
change which treasury contract is selected.

Default spending rules: 2 ETH per payment, 5 ETH per UTC day, and a small tier of
0.5 ETH. Small payments wait 15 seconds, large payments 60 seconds, governance
120 seconds, and recovery 180 seconds. Requests expire after one day.

## Recovery and governance

See [docs/DEMO.md](docs/DEMO.md) for the complete role-by-role demonstration.
Lost key: guardians initiate a recovery to a new address. Stolen key: owners use
**Governance → Replace Owner**; a thief holding the old key can veto guardian recovery.
Recovery replaces an address; it never reconstructs a private key.

The replacement account must confirm before recovery executes. An observer/new
owner can select the demo wallet or manually add its address, even though the
factory's creation-time membership index does not list that new address.

## Mock frontend mode

Copy `.env.example` to `.env`, change `VITE_USE_MOCK=true`, then start/restart `npm run dev`.
No chain or MetaMask is required. Click Connect, select roles from the demo switcher,
and use **Advance 60 seconds** to exercise timelocks. The banner explicitly identifies
simulated data. Refreshing the page resets it. Set the flag back to `false` for real
local-chain transactions. The mock is a UI fixture, not a security authority.

## Checks

```sh
npm run lint
npm test
npm run build
```

Optional automated browser walkthrough (requires ports 8545 and 5174 to be free):

```sh
npx playwright install chromium
npm run test:browser
```

The browser test starts its own disposable chain and Vite server, deploys fresh
contracts, and exercises a local EIP-1193 wallet adapter. **It does not automate
the actual MetaMask extension.** Complete the manual MetaMask checklist in
[docs/DEMO.md](docs/DEMO.md) on your computer.

Tests cover adversarial contract paths, seeded random payment sequences, the real
service, and mock fixtures. See [test/README.md](test/README.md) for coverage and limits.
CI runs lint, compilation, tests, ABI consistency, the production build, and browser tests.
A workflow file alone does not prove your GitHub run passed; check the Actions tab.

## Reset the demo

1. Stop the chain with Ctrl+C and run `npm run chain` again.
2. Run `npm run deploy` again, then reload the website.
3. If MetaMask retains stale transactions/nonces, use its account activity/nonce
   reset option for the disposable local test account. This does not delete the account.
4. To show a fresh connection prompt, disconnect the website in MetaMask's site
   permissions and reconnect.

Restarting the chain removes all wallet state. Old deployments are not persistent.

## Sepolia deployment (optional; not performed for this package)

1. Copy `.env.example` to `.env`.
2. Set `SEPOLIA_RPC_URL` and `DEPLOYER_KEY` for a funded **test-only** deployer.
3. Copy `config/demo-wallet.json` to `config/sepolia-wallet.json` and add real testnet
   `owners` and `guardians` arrays. All amounts in that JSON are **wei strings**.
4. Run:

   ```sh
   npm run deploy -- --network sepolia
   ```

5. Set `VITE_USE_MOCK=false`, `VITE_CHAIN_ID=11155111`, and `VITE_RPC_URL` to a Sepolia
   browser-compatible RPC. Restart Vite or rebuild the frontend.
6. Import/use your own funded Sepolia test accounts in MetaMask. Never use the local
   development keys here. Build with `npm run build` and serve `dist/` for static hosting.

If `config/sepolia-wallet.json` does not exist, the deploy command deploys just the
factory. Create a wallet in the UI. `artifacts/standard-input.json` contains the exact
compiler input for source verification. Use Solidity 0.8.24, optimizer 200, EVM paris,
and the factory contract path `contracts/TreasuryFactory.sol:TreasuryFactory`.
Explorer verification and hosted deployment are manual tasks, not completed claims.

`VITE_*` values are public in the browser. Use an origin-restricted, rate-limited RPC
credential; do not put a deployer key in a `VITE_*` variable.

## GitHub setup

Repository: https://github.com/PlasmaZero/damd-treasury-wallet

Use a feature branch and a pull request. Require one approving review and the `verify`
status check on `main`. Disable force pushes and branch deletion. These settings must
be enabled in GitHub; files in this download cannot configure your repository permissions.
See [docs/GITHUB_UPDATE.md](docs/GITHUB_UPDATE.md) for exact Windows copy/push steps.

## Code map

| Path | Responsibility |
| --- | --- |
| `contracts/interfaces/` | Frozen public ABI from Story 0 |
| `contracts/TreasuryBase.sol` | Members, configuration, validation, deposits |
| `contracts/TreasuryProposals.sol` | Approval, cancellation, payment execution |
| `contracts/TreasuryGovernance.sol` | Typed rule-change validation and dispatch |
| `contracts/TreasuryRecovery.sol` | Independent guardian recovery state machine |
| `contracts/Treasury.sol` | Final immutable wallet composition |
| `contracts/TreasuryFactory.sol` | Creates wallets and indexes original members |
| `src/App.jsx` | Role-aware React screens and transaction review |
| `src/services/walletService.js` | ethers.js reads, previews, writes, subscriptions |
| `src/services/mockWalletService.js` | Standalone frontend development fixtures |
| `src/contract/` | Generated ABIs, parameter encoding, error messages |
| `scripts/` | Compile, local chain, deploy, smoke, browser test |
| `docs/ARCHITECTURE.md` | Architecture, UML, state machines, design decisions |

## Scope and limitations

- ETH only; no tokens, swaps, fiat payments, mainnet, proxy upgrades, or key storage.
- Owner and guardian groups are disjoint and capped at 20 each.
- One confirmation is used for demo UX. Production reorg/finality handling is not implemented.
- A colluding approval quorum cannot be distinguished from legitimate approvals.
  Limits and cancellation windows constrain actions; they do not eliminate collusion.
- No unanimous fast path: approvals received after queueing never shorten/restart its timer.
- Factory discovery reflects membership at creation. New members can add a wallet by address.
- History scans logs in chunks; very large histories need indexing/pagination beyond this MVP.
- Sepolia funding/deployment/verification and the manual MetaMask walkthrough remain your tasks.
- Slither and Foundry are not part of this package; the story's Ganache/Node toolchain is used.
- This code is generated with AI assistance. Review it as a team and disclose assistance
  according to the course policy. It is not an independent security audit.

Pinned versions are in `package.json` and `package-lock.json`. The implementation choices
and differences from the input documents are recorded in [docs/DECISIONS.md](docs/DECISIONS.md).
