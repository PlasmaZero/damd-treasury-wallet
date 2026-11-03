# Deployment records

`npm run deploy` writes `1337.json` here and into `public/deployments/`.
The browser fetches the public copy at runtime. Restarting the local chain loses
its state: run the deploy command again before opening the app.

`npm run deploy -- --network sepolia` writes `11155111.json` to both directories.
Commit both copies: the GitHub Pages workflow only publishes once
`public/deployments/11155111.json` exists.

Shape:
```json
{
  "chainId": 1337,
  "factory": "0x...",
  "factoryDeployedAtBlock": 1,
  "demoWallet": "0x...",
  "rpcUrlEnv": "VITE_RPC_URL"
}
```
Only addresses and block numbers belong here. Private keys and RPC credentials do not.

`npm run verify:deployment [-- --network sepolia]` checks a record against the chain and
the current source, and fails on unexpected keys.
