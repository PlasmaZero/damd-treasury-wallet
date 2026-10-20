import ganache from "ganache";
const server = ganache.server({
  wallet: { deterministic: true, totalAccounts: 12, defaultBalance: 1000 },
  chain: { chainId: 1337, hardfork: "merge" },
  miner: { blockTime: 2 },
  logging: { quiet: true },
});

await server.listen(8545, "127.0.0.1");

console.log(
  "DAMD Local: http://127.0.0.1:8545 | chain ID 1337 | blocks every 2 seconds",
);

console.log("PUBLIC DISPOSABLE DEVELOPMENT ACCOUNTS — LOCAL TEST ETH ONLY");
Object.entries(server.provider.getInitialAccounts()).forEach(
  ([address, data], i) =>
    console.log(
      `${i}: ${i < 5 ? "OWNER" : i < 8 ? "GUARDIAN" : i === 8 ? "NEW OWNER" : i === 9 ? "RECIPIENT" : "EXTRA"}\nAddress: ${address}\nDevelopment key: ${data.secretKey}`,
    ),
);

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
