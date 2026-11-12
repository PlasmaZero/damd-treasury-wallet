# DAMD developer guide — draft for Milestone 5

## Prerequisites and local setup

Use Node.js **22.12 or later**, npm, Git and MetaMask for manual signing. CI uses
Node 22 on Ubuntu 24.04, pinned for Playwright OS compatibility. Dependencies and
solc are pinned by package-lock.json. No server-side
application, database or private key is needed to run the local integration suite.

```sh
npm ci
npx playwright install chromium
```

Use three terminals from the repository root:

```sh
# Terminal 1: disposable chain 1337
npm run chain

# Terminal 2: deploy the factory and default demo treasury
npm run deploy

# Terminal 3: frontend
npm run dev
```

Open http://127.0.0.1:5173. Add the local RPC http://127.0.0.1:8545, chain 1337,
to MetaMask. The chain prints public disposable signing accounts: owners 0–4
(3 approvals), guardians 5–7 (2 approvals), replacement 8, recipient 9, extra
owner 10. Do not use those keys on public networks. Restarting this chain clears
state: redeploy, reload the app and reset MetaMask's local activity if needed.

`.env.example` describes optional settings. Local defaults need no `.env`.
Mock mode uses `VITE_USE_MOCK=true`; it is explicitly simulated data and cannot
serve as contract integration evidence. Never commit `.env` or private keys.

## Source map and boundaries

| Location | Responsibility |
| --- | --- |
| `contracts/` | Immutable ETH treasury, proposals, governance, recovery and factory |
| `src/App.jsx` | Views, role controls, transaction review and refresh lifecycle |
| `src/services/walletService.js` | Ethers/MetaMask adapter, reads, simulation, writes, discovery and logs |
| `src/services/walletService.types.js` | Shared service data and operation contract |
| `src/services/mockWalletService.js` | Separate simulated implementation |
| `src/contract/` | ABI, action encoding, configuration validation, errors and warnings |
| `scripts/` | Compilation, deployment, verification and integration testing |
| `deployments/`, `public/deployments/` | Matching deployment records for tools and frontend |
| `test/` | Contract, adversarial, service and helper regression tests |

Amounts cross the service boundary as bigint wei; timestamps are Unix seconds.
Writes simulate, request a signature, publish the submitted hash and resolve after
one confirmation. Account/network changes invalidate open reviews. Read models
derive Ready and Invalidated without adding contract enum values.

The factory's `walletsOf` index records **creation-time** membership. App discovery
scans factory creation events and checks current treasury membership. Deployment
verification checks original members from the creation receipt, so later valid
governance or recovery changes do not fail publication.

## Checks and reproducible evidence

```sh
npm run lint
npm test
npm run build

# Complete local campaign, including production-build browser integration
npm run test:integration
```

The campaign runs lint, compilation, all Node tests, then the browser walkthrough.
It saves `test-results/integration-results.md` and `.json`, individual Node results
in `node-tests.xml`, per-step logs, desktop/mobile screenshots and a browser trace.
It stops on failure and reports later steps as skipped. Reports include the revision,
working-tree state, environment and timestamps. Individual Node tests can also be
selected with `node --test --test-name-pattern="..." test/service.test.mjs` after
compilation.

Browser testing owns ports **8545 and 5174**. Stop manually started local services
before running it. It deploys to disposable Ganache, tests the production bundle
under `/damd-treasury-wallet/`, and restores the two local deployment records.
It uses an EIP-1193 adapter rather than the MetaMask extension. Time jumps are
local-chain test helpers; they cannot speed up Sepolia timelocks.

CI installs Playwright's pinned Chromium. If downloading browsers is unavailable
locally, `PLAYWRIGHT_EXECUTABLE_PATH` can select an already installed compatible
Chromium; record this override and its version when reporting results. The normal
CI path does not require it. Ganache's uWS warning on newer Node versions falls
back to its JavaScript implementation.

Inspect traces with `npx playwright show-trace test-results/browser-trace.zip`.
CI uploads `test-results/` even when a check fails. Test counts describe implemented
cases, not percentage coverage or an independent security audit.

## Compilation and contract changes

`npm run compile` uses solc 0.8.24, optimizer 200 and EVM paris. It writes ignored
artifacts and regenerates the two committed ABI files. CI rejects ABI drift with
`git diff --exit-code -- src/contract/abi`. Solidity source text changes also affect
metadata; the public verifier checks exact deployed runtime including metadata,
after masking immutable slots.

Contracts are immutable. A contract change needs an explicit new deployment and
updated manifests; a frontend-only change does not. Keep existing treasury
addresses available to users and document any migration separately.

## Deployment and rollback plan

The [hosted Sepolia app](https://plasmazero.github.io/damd-treasury-wallet/) already
exists. Do not deploy another factory to clear a demo: create a new treasury in
the existing app instead.

For an intentional new contract deployment, configure real team addresses in
`config/sepolia-wallet.json` and the private environment values `SEPOLIA_RPC_URL`
and `DEPLOYER_KEY`. Fund only the testnet deployer, then run:

```sh
npm run deploy -- --network sepolia
npm run verify:deployment -- --network sepolia
```

Commit both copies of `11155111.json` from that same deployment. If source
publication is required, set `ETHERSCAN_API_KEY` privately and run
`npm run verify:etherscan`. A failure to publish source is not a reason to send
another deployment transaction.

The Pages workflow first calls the full reusable integration workflow. Only
after it passes does the build verify the committed Sepolia records, chain ID,
runtime bytecode, factory block, wallet provenance and original member index.
Etherscan source is also checked when its API key is configured. It then builds
with chain 11155111 and the repository base path and publishes Pages.

`VITE_*` settings are public in the bundle. A custom frontend RPC must permit
the Pages origin and should use appropriate origin restrictions. Deployment and
verification RPCs run outside the browser and must accept those requests.

Before submission, open the hosted site and run the manual MetaMask walkthrough
in [DEMO.md](DEMO.md), saving actual transaction links and outcomes. Include
connection/signature rejection, switching accounts during review and reconnecting
after an RPC interruption; those extension/network interactions are not proved
by the local wallet adapter.
For a frontend regression, revert the offending code commit and let the same
gates rebuild the previous working frontend. An immutable contract cannot be
rolled back; do not overwrite manifests with guessed addresses or claim that
reverting frontend code reverses transactions.
