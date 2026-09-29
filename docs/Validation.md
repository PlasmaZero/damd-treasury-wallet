# Validation — September 29, 2026

Validated on Linux with Node.js 24.19.0.

- Dependency installation: passed (`npm ci --prefer-offline`).
- ESLint: passed.
- Solidity compilation: passed (0.8.30).
- Contract tests: 2 passed.
- Vite production build: passed.
- Local startup and deployment: passed.
- Service integration: connected an RPC test account, read the initial zero balance, deposited 0.1 test ETH, read the updated balance, and rejected a zero deposit.
- UML PNG exports: visually inspected.

The service integration used a local RPC wallet adapter, not the actual MetaMask extension. The real browser wallet interaction still requires a manual walkthrough. GitHub-hosted CI and Windows execution were not tested in this environment.
