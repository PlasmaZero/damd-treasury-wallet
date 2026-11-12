// One reproducible local campaign. Never uses Sepolia or a deployer key.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'test-results');
fs.mkdirSync(output, {recursive: true});
for (const file of ['integration-results.json', 'integration-results.md', 'node-tests.xml', 'desktop.png', 'mobile.png', 'failure.png', 'browser-trace.zip'])
  fs.rmSync(path.join(output, file), {force: true});
const git = args => {
  const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
  return result.status === 0 ? result.stdout.trim() : null;
};
const report = {
  startedAt: new Date().toISOString(), revision: process.env.GITHUB_SHA || git(['rev-parse', 'HEAD']),
  workingTreeDirty: !!git(['status', '--porcelain']), node: process.version,
  browserExecutableOverride: !!process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  platform: `${process.platform}/${process.arch}`, network: 'disposable Ganache, chain 1337',
  browserWallet: 'EIP-1193 test adapter; actual MetaMask extension not tested', steps: []
};
const steps = [
  ['lint', ['node_modules/eslint/bin/eslint.js', '.']],
  ['compile', ['scripts/compile.mjs']],
  ['node-tests', ['--test', '--test-concurrency=1', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', '--test-reporter-destination=test-results/node-tests.xml', 'test/*.test.mjs']],
  ['browser', ['scripts/browser-test.mjs']]
];
async function run(name, args) {
  const start = Date.now(), log = fs.createWriteStream(path.join(output, `${name}.log`));
  console.log(`\nIntegration step: ${name}`);
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, args, {cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe']});
    child.stdout.on('data', data => {process.stdout.write(data); log.write(data);});
    child.stderr.on('data', data => {process.stderr.write(data); log.write(data);});
    let error;
    child.on('error', e => {error = e.message; log.write(`${error}\n`);});
    child.on('close', (code, signal) => resolve({exitCode: code, signal, ...(error ? {error} : {})}));
  });
  await new Promise(resolve => log.end(resolve));
  return {name, status: result.exitCode === 0 ? 'PASS' : 'FAIL', durationMs: Date.now() - start, log: `${name}.log`, ...result};
}
try {
  for (const [name, args] of steps) {
    const result = await run(name, args); report.steps.push(result);
    if (result.status === 'FAIL') break;
  }
} finally {
  for (const [name] of steps)
    if (!report.steps.some(s => s.name === name)) report.steps.push({name, status: 'SKIP'});
  report.finishedAt = new Date().toISOString();
  report.status = report.steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
  const junit = path.join(output, 'node-tests.xml');
  if (fs.existsSync(junit)) {
    const xml = fs.readFileSync(junit, 'utf8');
    report.nodeTests = {tests: (xml.match(/<testcase\b/g) || []).length, failures: (xml.match(/<failure\b/g) || []).length, skipped: (xml.match(/<skipped\b/g) || []).length};
  }
  fs.writeFileSync(path.join(output, 'integration-results.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'integration-results.md'), [
    '# Integration test results', '', `Result: **${report.status}**`, '',
    `Started: ${report.startedAt}. Finished: ${report.finishedAt}.`, '',
    `Revision: ${report.revision ?? 'unavailable'}. Working tree modified: ${report.workingTreeDirty}.`, '',
    `Environment: ${report.node}, ${report.platform}; ${report.network}.`, '',
    report.browserWallet + '.', '', '| Check | Result | Seconds | Log |', '| --- | --- | ---: | --- |',
    ...report.steps.map(s => `| ${s.name} | ${s.status} | ${s.durationMs == null ? '-' : (s.durationMs / 1000).toFixed(1)} | ${s.log ? `[${s.log}](${s.log})` : '-'} |`), '',
    report.nodeTests ? `Node tests: ${report.nodeTests.tests}; failures: ${report.nodeTests.failures}; skipped: ${report.nodeTests.skipped}. See node-tests.xml for individual results.` : 'Node test report was not produced.', '',
    'Browser testing builds and serves the production app under /damd-treasury-wallet/. Screenshots and the browser trace accompany completed browser runs.', '',
    'No public testnet transaction, actual MetaMask acceptance, coverage percentage, or independent security audit is implied.', ''
  ].join('\n'));
  console.log(`\nIntegration campaign ${report.status}: test-results/integration-results.md`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
