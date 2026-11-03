// Uploads the source of the Sepolia factory and demo wallet to Etherscan.
// Usage: npm run verify:etherscan [-- 0xOtherWallet ...] [-- --dry-run]
// Extra addresses are wallets created through the recorded factory (e.g. in the UI).
// --dry-run prints what would be submitted without calling Etherscan.
// Submission and polling live in scripts/lib/explorer.mjs; this file only gathers the targets.
import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { JsonRpcProvider, Contract, Interface, getAddress } from "ethers";
import { compile, root } from "./compile.mjs";
import { getPublishedSource, verifySource } from "./lib/explorer.mjs";

if (fs.existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const chainId = 11155111;
const dryRun = process.argv.includes("--dry-run");
const apiKey = process.env.ETHERSCAN_API_KEY;
if (!apiKey && !dryRun) throw new Error("Set ETHERSCAN_API_KEY in .env.");
const rpc =
  process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

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
const compilerVersion = `v${solc.version().split(".Emscripten")[0]}`;

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
  return new Interface(artifacts.Treasury.abi).encodeDeploy([call.args.config]);
}

// Submission IDs still in Etherscan's queue, so a rerun resumes them instead of resubmitting.
const pendingFile = path.join(root, "artifacts/etherscan-pending.json");
const pending = fs.existsSync(pendingFile)
  ? JSON.parse(fs.readFileSync(pendingFile, "utf8"))
  : {};
function savePending(address, guid) {
  if (guid) pending[address] = guid;
  else delete pending[address];
  fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2) + "\n");
}

async function verify(address, artifact, constructorArguments = "") {
  const contractName = `${artifact.sourceName}:${artifact.contractName}`;
  const label = `${artifact.contractName} ${address}`;
  if (dryRun) {
    console.log(
      `DRY RUN  ${label}: ${contractName}, ${compilerVersion}, ${Object.keys(input.sources).length} sources, constructor args ${constructorArguments ? `${(constructorArguments.length - 2) / 2} bytes` : "none"}`,
    );
    return true;
  }
  const guid = pending[address];
  try {
    const published = await getPublishedSource({
      address,
      contractName,
      apiKey,
    });
    if (published) {
      savePending(address, null);
      console.log(`DONE  ${label}: already verified, ${published.url}`);
      return true;
    }
    if (guid) console.log(`...   ${label}: resuming submission ${guid}`);
    const result = await verifySource({
      address,
      contractName,
      constructorArguments,
      input,
      compilerVersion,
      apiKey,
      guid,
      onSubmitted: (id) => savePending(address, id),
      onStatus: ({ attempt, attempts, stage, message }) =>
        console.log(`...   ${label} [${stage} ${attempt}/${attempts}]: ${message}`),
    });
    savePending(address, null);
    console.log(`DONE  ${label}: ${result.url}`);
    return true;
  } catch (e) {
    if (e.code === "PENDING")
      console.log(
        `WAIT  ${label}: still in Etherscan's queue. Run npm run verify:etherscan later; it resumes this submission instead of resubmitting.`,
      );
    else {
      // A failed or unknown submission is dropped so the next run submits afresh.
      savePending(address, null);
      console.log(`FAIL  ${label}: ${e.message}`);
    }
    return false;
  }
}

let failed = 0;
console.log(
  "Submitting to Etherscan. It can take a few minutes per contract; each reply is shown below.",
);
if (!(await verify(d.factory, artifacts.TreasuryFactory))) failed++;
for (const wallet of wallets)
  if (
    !(await verify(wallet, artifacts.Treasury, await constructorArgs(wallet)))
  )
    failed++;
provider.destroy();
if (!dryRun && !failed)
  console.log(
    "Verified. Run npm run verify:deployment -- --network sepolia to confirm.",
  );
process.exitCode = failed ? 1 : 0;
