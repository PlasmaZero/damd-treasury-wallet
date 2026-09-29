## 6. Prototype Status

The current prototype demonstrates basic communication between the React
frontend, MetaMask, and a Solidity contract on a local Ganache blockchain. Users
can connect a wallet, view the treasury balance, and deposit test ETH. After the
transaction is confirmed, the interface updates the balance and displays a
confirmation message. The contract starts with zero funds. This establishes the
basic read and write flow before implementing the main wallet features.

To run it locally, reviewers need Node.js 22.12 or later, npm, and MetaMask. In the
project folder, run `npm ci`, then `npm run chain`. Keep that terminal open and
run `npm run deploy` followed by `npm run dev` in a second terminal. Open
http://127.0.0.1:5173. Configure MetaMask with RPC URL http://127.0.0.1:8545,
chain ID 1337, and currency symbol ETH. Import the disposable development account
printed by the local chain script into MetaMask, connect it, and deposit 0.1 test
ETH. The README provides the full setup steps. `npm run lint`, `npm test`, and
`npm run build` run the project's checks.

Multisignature approval, outgoing payments, spending limits, timelocks, social
recovery, and transaction-history views are not implemented yet. Deposits cannot
be withdrawn in this version. The prototype uses local test funds only and has
not been deployed to a public testnet. The balance refreshes on page load, after
a confirmed deposit, or when the user clicks Refresh balance. The real MetaMask
interaction requires a manual demonstration. These limitations keep Milestone 2
focused on environment setup, the initial interface, and basic blockchain
integration while the full features remain part of the planned design.
