# Validation record

Validated on 2026-10-16 with Node.js 24.19.0 and npm 11.9.0.

- `npm run lint`: passed.
- `npm test`: 34 tests passed, zero failures (29 contract tests and 5 service/mock tests).
- `npm run build`: passed.
- Solidity 0.8.24, optimizer 200, EVM paris: compiled successfully.
- Deployed runtime size: Treasury 17,695 bytes; TreasuryFactory 22,161 bytes, both below the 24,576-byte limit.
- Linux lockfile installation resolution was checked with `npm ci --ignore-scripts --no-audit --dry-run` after marking the nested macOS-only fsevents entry optional.

This is functional verification, not a security audit or formal proof. Tests use a local chain and disposable accounts. The actual MetaMask extension, Windows environment, public Sepolia deployment, explorer verification, and GitHub-hosted Actions run have not been manually validated here. Complete `docs/DEMO.md` on your own machine before presenting.

`npm run test:browser` passed: wallet connection, deposit, three-owner payment approval and execution, governed owner addition, full guardian recovery including new-owner confirmation, event history, and desktop/mobile rendering. No browser page errors or horizontal overflow at 390px were detected. This used an injected EIP-1193 test adapter with real local contracts, not the MetaMask extension. A five-second refresh fallback keeps the UI current if RPC subscriptions stop delivering events.
