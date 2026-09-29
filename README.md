# DAMD Treasury — Milestone 2 minimal prototype

This prototype demonstrates the connection between a React interface, MetaMask,
and a Solidity contract on a local blockchain. It does three things:

1. Connect a MetaMask account.
2. Display the treasury contract's balance.
3. Deposit test ETH and update the balance after confirmation.

Multisignature payments, spending limits, timelocks, and social recovery are
planned for later milestones. There are no owners, approvals, payment proposals,
or withdrawals in this version. The contract starts with 0 test ETH.

## Run locally

Install Node.js 22.12+ and MetaMask. Extract this project and open a terminal in
the folder containing `package.json`.

Terminal 1:

```sh
npm ci
npm run chain
```

Wait until the terminal prints `DAMD Local: http://127.0.0.1:8545`.
Keep it open. In another terminal in the same folder:

```sh
npm run deploy
npm run dev
```

Deployment compiles the contract automatically. Open http://127.0.0.1:5173.

Add the following custom network in MetaMask:

| Setting | Value |
| --- | --- |
| Network name | DAMD Local |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 1337 |
| Currency symbol | ETH |

In a dedicated test browser profile, import the disposable development account
printed by `npm run chain`. Import its key into MetaMask only. The app never asks
for your key or seed phrase. These development keys are publicly known: use
local test ETH only, never real funds.

## One-minute demo

1. Show the treasury balance of 0 test ETH.
2. Click **Connect MetaMask** and approve the connection.
3. Enter **0.1** and click **Deposit**.
4. Confirm in MetaMask. Wait for the confirmation message.
5. Show the new balance of **0.1 test ETH**.

Explain: "This milestone proves the frontend can read blockchain data and submit
a signed transaction. We will build the multisignature and recovery features in
later milestones."

The treasury cannot send funds out yet. Restarting the local chain resets it.
After a restart, run `npm run deploy` again and reload the page. If MetaMask has
stale transactions, clear activity/nonce data for the disposable test account.

## Checks

```sh
npm run lint
npm test
npm run build
```

The two contract tests check an initial zero balance and deposits from different
accounts, including deposit event data. GitHub Actions runs lint, compilation,
tests, and the frontend build on pushes and pull requests. The workflow file is
included; check the Actions tab for the result of your own GitHub run.

## Main files

| File | What it does |
| --- | --- |
| `contracts/Treasury.sol` | Accepts deposits and returns the current balance. |
| `src/app.jsx` | React interface with Connect, Refresh balance, and Deposit. |
| `src/walletService.js` | Reads the contract and asks MetaMask to sign deposits. |
| `scripts/chain.mjs` | Starts a local test blockchain. |
| `scripts/deploy.mjs` | Deploys the contract and writes its public configuration. |
| `docs/Prototype_Status.md` | Updated Section 6 text for the milestone report. |
| `docs/UML.drawio` | Editable class and deposit sequence diagrams. |

The thin Web3 service is a Facade/Adapter: it gives the interface a small set of
methods while hiding ethers.js and wallet connection details.

## Updating your existing repository

Use a new branch if you want to keep the larger prototype easy to recover.
Copy these files into your existing repository folder, including `.github` and
`.gitignore`. Remove the old `src/app.js`: this version uses `src/app.jsx`.
Do not delete your repository's `.git` folder. Do not copy `node_modules`,
`artifacts`, `dist`, or an old `public/deployment.json`. Run the setup above.
Commit the changes and check GitHub Actions after pushing.

For the report, distinguish the **planned full design** from the **implemented
minimal prototype**. Existing architecture/payment/recovery diagrams may remain
as planned design if labeled that way. The diagrams in `docs` match this code.
Update old claims that proposals, approvals, limits, or timelocks already run.
Keep the assignment's architecture, UML, rationale, tech stack, repository/CI,
and prototype-status sections; reducing the demo does not remove those tasks.

## Limitations

Local network only; no payments out, multisignature approval, spending rules,
timelocks, recovery, tokens, or public testnet deployment. The balance loads on
startup, after a successful deposit, or when Refresh balance is clicked. There
is no polling, event subscription, or transaction-history interface. It has not
been audited for real funds. Browser interaction with the real MetaMask
extension still requires a manual walkthrough.

Ganache may warn about a native uWS binary and use its JavaScript fallback.
Keep the lockfile's nested macOS-only fsevents dependency marked optional so
installation works on Linux CI.

## Attribution

Prepared with AI assistance. Review and understand the code, and disclose
assistance according to the course policy. No claim is made about which team
member personally wrote or tested these files.
