// Read-only check that a deployment record matches the chain and the current source.
// Usage: npm run verify:deployment [-- --network sepolia]
// Exits non-zero if any check fails, so CI can gate on it. Sends no transactions.
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { JsonRpcProvider, Contract, getAddress } from "ethers";
import { compile, root } from "./compile.mjs";

if (fs.existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const network = process.argv.includes("sepolia") ? "sepolia" : "ganache";
const expectedChainId = network === "sepolia" ? 11155111 : 1337;
// Same public fallback as src/App.jsx. Empty CI variables count as unset.
const rpc =
  network === "sepolia"
    ? process.env.SEPOLIA_RPC_URL ||
      "https://ethereum-sepolia-rpc.publicnode.com"
    : "http://127.0.0.1:8545";
const configFile =
  network === "sepolia"
    ? "config/sepolia-wallet.json"
    : "config/demo-wallet.json";
const manifestKeys = [
  "chainId",
  "factory",
  "factoryDeployedAtBlock",
  "demoWallet",
  "rpcUrlEnv",
];

let failures = 0;
let warnings = 0;
async function check(label, fn) {
  try {
    const note = await fn();
    console.log(`PASS  ${label}${note ? ` (${note})` : ""}`);
    return true;
  } catch (e) {
    failures++;
    console.log(`FAIL  ${label}: ${e.shortMessage ?? e.message}`);
    return false;
  }
}
function warn(label, message) {
  warnings++;
  console.log(`WARN  ${label}: ${message}`);
}
function skip(label, message) {
  console.log(`SKIP  ${label}: ${message}`);
}

// Zero the immutable slots (e.g. deployedAtBlock), which solc leaves blank in its output.
function masked(code, refs) {
  let hex = code.slice(2).toLowerCase();
  for (const list of Object.values(refs))
    for (const { start, length } of list)
      hex =
        hex.slice(0, start * 2) +
        "00".repeat(length) +
        hex.slice((start + length) * 2);
  return hex;
}
// The last two bytes give the length of the CBOR metadata (source hash) before them.
function withoutMetadata(hex) {
  return hex.slice(0, -(parseInt(hex.slice(-4), 16) + 2) * 2);
}
async function matchesSource(address, artifact) {
  const code = await provider.getCode(address);
  if (code === "0x") throw new Error(`no contract code at ${address}`);
  const live = masked(code, artifact.immutableReferences);
  const built = masked(artifact.deployedBytecode, artifact.immutableReferences);
  if (live === built) return `${(code.length - 2) / 2} bytes`;
  if (withoutMetadata(live) === withoutMetadata(built))
    throw new Error(
      `only the metadata hash differs: ${artifact.sourceName} text changed (comments or formatting) since it was deployed`,
    );
  throw new Error(
    `runtime bytecode differs from ${artifact.sourceName}: redeploy, or check out the commit that was deployed`,
  );
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

let provider;
async function verify() {
  console.log(`Verifying ${network} deployment (chain ${expectedChainId})`);
  const manifestFile = `deployments/${expectedChainId}.json`;
  let d;
  const manifestOk = await check(`${manifestFile} is well formed`, () => {
    d = readJson(manifestFile);
    const extra = Object.keys(d).filter((k) => !manifestKeys.includes(k));
    if (extra.length)
      throw new Error(
        `unexpected keys ${extra.join(", ")} (records hold only addresses and block numbers)`,
      );
    if (d.chainId !== expectedChainId)
      throw new Error(`chainId is ${d.chainId}, expected ${expectedChainId}`);
    if (d.factory !== getAddress(d.factory))
      throw new Error("factory is not a checksummed address");
    if (d.demoWallet !== null && d.demoWallet !== getAddress(d.demoWallet))
      throw new Error("demoWallet is not a checksummed address or null");
    if (
      !Number.isInteger(d.factoryDeployedAtBlock) ||
      d.factoryDeployedAtBlock < 0
    )
      throw new Error("factoryDeployedAtBlock is not a block number");
  });
  if (!manifestOk) return;
  await check(`public/${manifestFile} matches ${manifestFile}`, () => {
    if (!isDeepStrictEqual(readJson(`public/${manifestFile}`), d))
      throw new Error("the copies differ; commit the output of one deploy run");
  });

  provider = new JsonRpcProvider(rpc, undefined, { cacheTimeout: 0 });
  const chainOk = await check(
    `RPC is on chain ${expectedChainId}`,
    async () => {
      const id = Number((await provider.getNetwork()).chainId);
      if (id !== expectedChainId) throw new Error(`RPC reports chain ${id}`);
      return `block ${await provider.getBlockNumber()}`;
    },
  );
  if (!chainOk) return;

  const artifacts = compile();
  const factory = new Contract(
    d.factory,
    artifacts.TreasuryFactory.abi,
    provider,
  );
  const factoryOk = await check(
    `factory ${d.factory} runs the current TreasuryFactory source`,
    () => matchesSource(d.factory, artifacts.TreasuryFactory),
  );
  if (factoryOk)
    await check(
      "factoryDeployedAtBlock matches the factory's own record",
      async () => {
        const block = Number(await factory.deployedAtBlock());
        if (block !== d.factoryDeployedAtBlock)
          throw new Error(
            `record says ${d.factoryDeployedAtBlock}, factory says ${block}; the app would scan for wallets from the wrong block`,
          );
        return `block ${block}`;
      },
    );

  if (!d.demoWallet) skip("demo wallet", "the record has no demoWallet");
  else if (
    (await check(
      `demo wallet ${d.demoWallet} runs the current Treasury source`,
      () => matchesSource(d.demoWallet, artifacts.Treasury),
    )) &&
    factoryOk
  ) {
    const wallet = new Contract(d.demoWallet, artifacts.Treasury.abi, provider);
    await check("demo wallet was created by the recorded factory", async () => {
      const block = Number(await wallet.deployedAtBlock());
      const logs = await factory.queryFilter(
        factory.filters.WalletCreated(d.demoWallet),
        block,
        block,
      );
      if (!logs.length)
        throw new Error(
          `no WalletCreated event for it from ${d.factory} in block ${block}`,
        );
      return `block ${block}`;
    });
    const config = await wallet.getConfig();
    await check(
      "factory lists the demo wallet for every owner and guardian",
      async () => {
        const members = [...config.owners, ...config.guardians];
        for (const a of members)
          if (!(await factory.walletsOf(a)).includes(d.demoWallet))
            throw new Error(`walletsOf(${a}) does not include it`);
        return `${members.length} members`;
      },
    );
    // A mismatch is a warning: governance or recovery may have changed the wallet since deploy.
    if (fs.existsSync(path.join(root, configFile))) {
      const expected = readJson(configFile);
      const live = {
        owners: [...config.owners],
        guardians: [...config.guardians],
        threshold: config.threshold,
        guardianThreshold: config.guardianThreshold,
        limits: config.limits.toObject(),
        delays: config.delays.toObject(),
      };
      const differs = [];
      for (const key of ["owners", "guardians"])
        if (
          expected[key] &&
          !isDeepStrictEqual(
            expected[key].map(getAddress).sort(),
            live[key].sort(),
          )
        )
          differs.push(key);
      for (const key of ["threshold", "guardianThreshold"])
        if (expected[key] !== undefined && BigInt(expected[key]) !== live[key])
          differs.push(key);
      for (const group of ["limits", "delays"])
        for (const [key, value] of Object.entries(expected[group] ?? {}))
          if (BigInt(value) !== live[group][key])
            differs.push(`${group}.${key}`);
      if (differs.length)
        warn(
          `demo wallet config vs ${configFile}`,
          `${differs.join(", ")} differ (expected if governance or recovery changed them)`,
        );
      else console.log(`PASS  demo wallet config matches ${configFile}`);
    }
  }

  if (network !== "sepolia") skip("Etherscan source", "local chain");
  else if (!process.env.ETHERSCAN_API_KEY)
    skip("Etherscan source", "set ETHERSCAN_API_KEY to check it");
  else
    for (const [name, address] of [
      ["TreasuryFactory", d.factory],
      ["Treasury", d.demoWallet],
    ].filter(([, a]) => a))
      await check(`${name} source is verified on Etherscan`, async () => {
        const url = new URL("https://api.etherscan.io/v2/api");
        url.search = new URLSearchParams({
          chainid: String(expectedChainId),
          module: "contract",
          action: "getsourcecode",
          address,
          apikey: process.env.ETHERSCAN_API_KEY,
        });
        const body = await (await fetch(url)).json();
        if (body.status !== "1") throw new Error(`Etherscan: ${body.result}`);
        const [source] = body.result;
        if (!source.SourceCode)
          throw new Error(
            `not verified; upload artifacts/standard-input.json at https://sepolia.etherscan.io/verifyContract?a=${address}`,
          );
        if (source.ContractName !== name)
          throw new Error(
            `verified as ${source.ContractName}, expected ${name}`,
          );
        return `https://sepolia.etherscan.io/address/${address}#code`;
      });
}

await verify();
provider?.destroy();
console.log(
  failures
    ? `Deployment verification FAILED: ${failures} check(s) failed.`
    : `Deployment verified${warnings ? ` with ${warnings} warning(s)` : ""}.`,
);
process.exitCode = failures ? 1 : 0;
