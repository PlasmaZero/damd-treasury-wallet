import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { fileURLToPath } from "node:url";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function compile() {
  const sources = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), {
      withFileTypes: true,
    })) {
      const name = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(name);
      else if (name.endsWith(".sol"))
        sources[name] = {
          content: fs.readFileSync(path.join(root, name), "utf8"),
        };
    }
  };

  walk("contracts");
  walk("test/contracts");
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };

  const out = JSON.parse(
    solc.compile(JSON.stringify(input), {
      import: (name) => {
        try {
          const contents = fs.readFileSync(
            path.join(root, "node_modules", name),
            "utf8",
          );
          input.sources[name] = { content: contents };
          return { contents };
        } catch {
          return { error: `Missing import ${name}` };
        }
      },
    }),
  );

  for (const error of out.errors ?? [])
    if (error.severity === "error") throw new Error(error.formattedMessage);
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "artifacts/standard-input.json"),
    JSON.stringify(input, null, 2),
  );

  const artifacts = {};
  for (const [file, contracts] of Object.entries(out.contracts))
    for (const [name, c] of Object.entries(contracts)) {
      if (!c.evm.bytecode.object) continue;
      const bytes = c.evm.deployedBytecode.object.length / 2;
      if (bytes > 24576)
        throw new Error(`${name} exceeds EIP-170: ${bytes} bytes`);
      const artifact = {
        contractName: name,
        sourceName: file,
        abi: c.abi,
        bytecode: `0x${c.evm.bytecode.object}`,
        deployedBytes: bytes,
      };
      artifacts[name] = artifact;
      fs.writeFileSync(
        path.join(root, `artifacts/${name}.json`),
        JSON.stringify(artifact, null, 2),
      );
      if (["Treasury", "TreasuryFactory"].includes(name))
        fs.writeFileSync(
          path.join(root, `src/contract/abi/${name}.json`),
          JSON.stringify(c.abi, null, 2) + "\n",
        );
    }

  console.log(
    `Compiled with solc ${solc.version()}. Treasury: ${artifacts.Treasury.deployedBytes} bytes; factory: ${artifacts.TreasuryFactory.deployedBytes} bytes.`,
  );
  
  return artifacts;

}

if (process.argv[1] === fileURLToPath(import.meta.url)) compile();
