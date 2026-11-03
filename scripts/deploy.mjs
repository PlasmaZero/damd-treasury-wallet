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
console.log(
  "Deployment complete. Treasury starts empty. Deposit through the app.",
);
provider.destroy();
