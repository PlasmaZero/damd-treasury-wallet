# Prototype status — full local MVP

The React application connects to immutable Solidity treasury contracts through an ethers.js
service and MetaMask. It supports multiple wallets, deposits, M-of-N payment approvals,
per-payment and daily limits, timed execution, cancellation, governance changes, guardian
recovery, and event history. The app previews actions before requesting signatures and
refreshes authoritative chain state after confirmation, new blocks, and account changes.
A separate labeled mock mode provides frontend fixtures without a blockchain.

Reviewers install Node.js 22.12+ and MetaMask, run `npm ci`, and keep `npm run chain`
running in one terminal. In a second terminal they run `npm run deploy` followed by
`npm run dev`, then open http://127.0.0.1:5173. MetaMask uses RPC http://127.0.0.1:8545,
chain ID 1337 and ETH. Disposable accounts and their roles are printed by the local chain.
Checks are `npm run lint`, `npm test`, and `npm run build`. The optional browser walkthrough
uses `npm run test:browser` after installing Playwright Chromium.

The implementation is for test funds, has not been independently audited, and has not
been deployed to Sepolia as part of this delivery. Sepolia deployment tooling is included.
Real MetaMask extension behavior still needs the team's manual walkthrough. Mainnet,
ERC-20 tokens, proxies, indexers, and production finality handling are out of scope.
Restarting the local chain resets state and requires deployment again.
