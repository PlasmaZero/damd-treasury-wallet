import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root} from './compile.mjs';
import {buildFixtureApp} from './lib/ci-app.mjs';

const directory=path.join(root,'test-results/sepolia');
const report=JSON.parse(fs.readFileSync(path.join(directory,'evidence.json')));
assert.equal(report.mode,'public');assert.equal(report.chainId,11155111);
assert.equal(report.status,'contract-and-source-checks-passed');
assert.ok(process.env.SEPOLIA_BROWSER_RPC_URL,'Missing public browser RPC variable.');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'deployment.json')));
await buildFixtureApp({directory,chainId:11155111,rpcUrl:process.env.SEPOLIA_BROWSER_RPC_URL,manifest});
