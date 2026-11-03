import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider, Wallet, ContractFactory, getAddress } from "ethers";
import { compile, root } from "./compile.mjs";

if (fs.existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const network = process.argv.includes("sepolia") ? "sepolia" : "ganache";
const rpc =
  network === "sepolia" ? process.env.SEPOLIA_RPC_URL : "http://127.0.0.1:8545";
if (!rpc) throw new Error("Set SEPOLIA_RPC_URL in .env.");
const provider = new JsonRpcProvider(rpc, undefined, { cacheTimeout: 0 });
const chainId = Number((await provider.getNetwork()).chainId);
if (chainId !== (network === "sepolia" ? 11155111 : 1337))
  throw new Error("Wrong deployment network.");
if (network === "sepolia" && !process.env.DEPLOYER_KEY)
  throw new Error("Set DEPLOYER_KEY in .env.");
if (network === "sepolia") {
  // Describe a malformed key's shape without ever printing the key itself.
  const key = process.env.DEPLOYER_KEY.trim().replace(/^["']|["']$/g, "");
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(key)) {
    const words = key.split(/\s+/).length;
    throw new Error(
      words >= 12
        ? `DEPLOYER_KEY looks like a ${words}-word recovery phrase. Use the account's private key instead (MetaMask → Account details → Show private key).`
        : `DEPLOYER_KEY must be 64 hex characters (optional 0x prefix); found ${key.replace(/^0x/, "").length} characters${/^(0x)?[0-9a-fA-F]*$/.test(key) ? "" : " including non-hex ones"}.`,
    );
  }
  process.env.DEPLOYER_KEY = key;
}
const signer =
  network === "sepolia"
    ? new Wallet(process.env.DEPLOYER_KEY, provider)
    : await provider.getSigner(0);
const artifacts = compile();
const factory = await new ContractFactory(
  artifacts.TreasuryFactory.abi,
  artifacts.TreasuryFactory.bytecode,
  signer,
).deploy();
const receipt = await factory.deploymentTransaction().wait();
const factoryAddress = await factory.getAddress();
let demoWallet = null;
const configFile =
  network === "sepolia"
    ? "config/sepolia-wallet.json"
    : "config/demo-wallet.json";
if (fs.existsSync(path.join(root, configFile))) {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, configFile), "utf8"),
  );
  if (network === "ganache") {
    const accounts = (await provider.send("eth_accounts", [])).map(getAddress);
    config.owners = accounts.slice(0, 5);
    config.guardians = accounts.slice(5, 8);
  } else if (!config.owners?.length || !config.guardians?.length) {
    throw new Error(
      `Add your team's Sepolia owners and guardians arrays to ${configFile}.`,
    );
  }
  const tx = await factory.createWallet(config);
  const r = await tx.wait();
  const event = r.logs
    .map((l) => {
      try {
        return factory.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((l) => l?.name === "WalletCreated");
  demoWallet = event.args.wallet;
}
const deployment = {
  chainId,
  factory: factoryAddress,
  factoryDeployedAtBlock: receipt.blockNumber,
  demoWallet,
  rpcUrlEnv: "VITE_RPC_URL",
};
for (const dir of ["deployments", "public/deployments"])
  fs.writeFileSync(
    path.join(root, dir, `${chainId}.json`),
    JSON.stringify(deployment, null, 2) + "\n",
  );
console.log(JSON.stringify(deployment, null, 2));
if (network === "sepolia") {
  console.log(`Factory: https://sepolia.etherscan.io/address/${factoryAddress}`);
  if (demoWallet)
    console.log(`Demo wallet: https://sepolia.etherscan.io/address/${demoWallet}`);
  console.log(
    `Commit deployments/${chainId}.json and public/deployments/${chainId}.json so the hosted site can find these contracts.`,
  );
}
console.log(
  "Deployment complete. Treasury starts empty. Deposit through the app.",
);
provider.destroy();
