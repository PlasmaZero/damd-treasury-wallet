// Uploads the source of the Sepolia factory and demo wallet to Etherscan.
// Usage: npm run verify:etherscan [-- 0xOtherWallet ...] [-- --dry-run]
// Extra addresses are wallets created through the recorded factory (e.g. in the UI).
// --dry-run prints what would be submitted without calling Etherscan.
import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { JsonRpcProvider, Contract, Interface, getAddress } from "ethers";
import { compile, root } from "./compile.mjs";

if (fs.existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const chainId = 11155111;
const dryRun = process.argv.includes("--dry-run");
const apiKey = process.env.ETHERSCAN_API_KEY;
if (!apiKey && !dryRun) throw new Error("Set ETHERSCAN_API_KEY in .env.");
const rpc =
  process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const api = `https://api.etherscan.io/v2/api?chainid=${chainId}`;

const d = JSON.parse(
  fs.readFileSync(path.join(root, `deployments/${chainId}.json`), "utf8"),
);
const wallets = [
  d.demoWallet,
  ...process.argv.slice(2).filter((a) => a.startsWith("0x")),
]
  .filter(Boolean)
  .map(getAddress);

const artifacts = compile();
const input = JSON.parse(
  fs.readFileSync(path.join(root, "artifacts/standard-input.json"), "utf8"),
);
// Test-only contracts do not affect these bytecodes; keep them off Etherscan.
for (const name of Object.keys(input.sources))
  if (name.startsWith("test/")) delete input.sources[name];
const compilerVersion = `v${solc.version().match(/^[\d.]+\+commit\.[0-9a-f]+/)[0]}`;

const provider = new JsonRpcProvider(rpc, undefined, { cacheTimeout: 0 });
if (Number((await provider.getNetwork()).chainId) !== chainId)
  throw new Error("SEPOLIA_RPC_URL is not a Sepolia endpoint.");
const factory = new Contract(
  d.factory,
  artifacts.TreasuryFactory.abi,
  provider,
);

// A factory-made wallet's constructor argument is the config passed to createWallet,
// so read it back from the transaction that emitted WalletCreated.
async function constructorArgs(wallet) {
  const treasury = new Contract(wallet, artifacts.Treasury.abi, provider);
  const block = Number(await treasury.deployedAtBlock());
  const [log] = await factory.queryFilter(
    factory.filters.WalletCreated(wallet),
    block,
    block,
  );
  if (!log) throw new Error(`${wallet} was not created by ${d.factory}`);
  const tx = await provider.getTransaction(log.transactionHash);
  const call = factory.interface.parseTransaction(tx);
  if (call?.name !== "createWallet")
    throw new Error(
      `${log.transactionHash} did not call createWallet directly`,
    );
  return new Interface(artifacts.Treasury.abi)
    .encodeDeploy([call.args.config])
    .slice(2);
}

async function etherscan(params, method = "GET") {
  const body = new URLSearchParams({ ...params, apikey: apiKey });
  const res =
    method === "POST"
      ? await fetch(api, { method, body })
      : await fetch(`${api}&${body}`);
  return res.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function verify(address, artifact, args) {
  const label = `${artifact.contractName} ${address}`;
  if (dryRun) {
    console.log(
      `DRY RUN  ${label}: ${artifact.sourceName}:${artifact.contractName}, ${compilerVersion}, ${Object.keys(input.sources).length} sources, constructor args ${args ? `${args.length / 2} bytes` : "none"}`,
    );
    return true;
  }
  const existing = await etherscan({
    module: "contract",
    action: "getsourcecode",
    address,
  });
  if (existing.result?.[0]?.SourceCode) {
    console.log(`DONE  ${label}: already verified`);
    return true;
  }
  let guid;
  // Etherscan can lag behind the chain for a freshly deployed contract.
  for (let attempt = 1; !guid; attempt++) {
    const r = await etherscan(
      {
        module: "contract",
        action: "verifysourcecode",
        codeformat: "solidity-standard-json-input",
        sourceCode: JSON.stringify(input),
        contractaddress: address,
        contractname: `${artifact.sourceName}:${artifact.contractName}`,
        compilerversion: compilerVersion,
        constructorArguements: args ?? "", // Etherscan's spelling.
      },
      "POST",
    );
    if (r.status === "1") guid = r.result;
    else if (/already verified/i.test(r.result)) {
      console.log(`DONE  ${label}: already verified`);
      return true;
    } else if (/unable to locate contractcode/i.test(r.result) && attempt < 6)
      await sleep(10000);
    else {
      console.log(`FAIL  ${label}: ${r.result}`);
      return false;
    }
  }
  for (let attempt = 0; attempt < 24; attempt++) {
    await sleep(5000);
    const r = await etherscan({
      module: "contract",
      action: "checkverifystatus",
      guid,
    });
    if (/pending/i.test(r.result)) continue;
    const ok = r.status === "1" || /already verified/i.test(r.result);
    console.log(`${ok ? "DONE" : "FAIL"}  ${label}: ${r.result}`);
    return ok;
  }
  console.log(
    `FAIL  ${label}: still pending; check Etherscan later (guid ${guid})`,
  );
  return false;
}

let failed = 0;
if (!(await verify(d.factory, artifacts.TreasuryFactory))) failed++;
for (const wallet of wallets)
  if (
    !(await verify(wallet, artifacts.Treasury, await constructorArgs(wallet)))
  )
    failed++;
provider.destroy();
if (!dryRun && !failed)
  console.log(
    `Verified. Explorer: https://sepolia.etherscan.io/address/${d.factory}#code\nRun npm run verify:deployment -- --network sepolia to confirm.`,
  );
process.exitCode = failed ? 1 : 0;
