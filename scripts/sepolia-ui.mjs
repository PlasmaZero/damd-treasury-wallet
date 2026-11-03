import fs from 'node:fs';
import path from 'node:path';
import {root} from './compile.mjs';
import {verifyFrontend} from './lib/public-ui.mjs';
const directory=path.join(root,'test-results/sepolia');
try {
 const report=JSON.parse(fs.readFileSync(path.join(directory,'evidence.json')));
 await verifyFrontend({report,directory,rpcUrl:process.env.SEPOLIA_BROWSER_RPC_URL,appDir:path.join(directory,'app')});
} catch {
 console.error('Public frontend verification failed. See the evidence artifact.');process.exitCode=1;
}
