// Etherscan V2 standard-JSON verification. The fixed host keeps API keys off arbitrary URLs.
const endpoint = 'https://api.etherscan.io/v2/api';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function client(apiKey, fetcher) {
  if (!apiKey) throw Error('ETHERSCAN_API_KEY is required.');
  return async function request(params, post = false) {
    const auth = new URLSearchParams({chainid:'11155111',apikey:apiKey});
    const body = new URLSearchParams({module:'contract',...params});
    let response;
    try {
      response = await fetcher(post ? `${endpoint}?${auth}` : `${endpoint}?${auth}&${body}`, {
        ...(post ? {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body} : {}),
        signal:AbortSignal.timeout(30000),
      });
    } catch { throw Error('Explorer request failed or timed out.'); }
    if ([429,500,502,503,504].includes(response.status)) return {status:'0',result:'temporarily unavailable'};
    if (!response.ok) throw Error(`Explorer HTTP failure ${response.status}.`);
    try { return await response.json(); } catch { throw Error('Explorer returned invalid JSON.'); }
  };
}

// Returns the published verified source for address, or null if Etherscan has none.
// Shared by verifySource and scripts/verify-deployment.mjs so both apply the same rules.
export async function getPublishedSource({address, contractName, compilerVersion, apiKey, fetcher = fetch}) {
  const result = await client(apiKey, fetcher)({action:'getsourcecode', address});
  // An unverified contract still answers status '1'. Anything else (e.g. an invalid key) is an
  // error, not "not verified"; only transient errors fall back to null so callers retry.
  if (result.status !== '1') {
    if (/rate limit|temporarily/i.test(String(result.result))) return null;
    throw Error(`Explorer error: ${String(result.result).replaceAll(apiKey, '[redacted]').slice(0, 500)}`);
  }
  const source = Array.isArray(result.result) ? result.result[0] : null;
  if (!source?.SourceCode || !source.ABI || source.ABI === 'Contract source code not verified') return null;
  try { JSON.parse(source.ABI); } catch { return null; }
  if (source.ContractName !== contractName.split(':').at(-1)) throw Error('Explorer contract name mismatch.');
  if (compilerVersion && source.CompilerVersion !== compilerVersion) throw Error('Explorer compiler version mismatch.');
  return {address, contractName, status:'verified', compilerVersion:source.CompilerVersion,
    url:`https://sepolia.etherscan.io/address/${address}#code`};
}

export async function verifySource({address, contractName, constructorArguments = '', input,
  compilerVersion, apiKey, fetcher = fetch, pause = sleep, attempts = 60, intervalMs = 10000, onStatus = () => {},
  guid: resumeGuid = null, onSubmitted = () => {}}) {
  const request = client(apiKey, fetcher);
  const clean = value => String(value).replaceAll(apiKey, '[redacted]').slice(0, 500);
  // Each Etherscan reply is reported so a long queue or retry loop is visible, not silent.
  const report = (attempt, stage, message) => onStatus({attempt:attempt + 1, attempts, stage, message:clean(message)});
  // Already-verified sources must still be retrievable as a usable verified contract.
  const confirmPublished = () => getPublishedSource({address, contractName, compilerVersion, apiKey, fetcher});
  // Resuming a known submission keeps its place in Etherscan's queue instead of adding another.
  let guid = resumeGuid;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!guid) {
      const submitted = await request({action:'verifysourcecode', contractaddress:address,
        sourceCode:JSON.stringify(input), codeformat:'solidity-standard-json-input', contractname:contractName,
        compilerversion:compilerVersion, optimizationUsed:'1', runs:'200', evmVersion:'paris',
        // Etherscan documents the misspelled name; send both so either parser accepts it.
        constructorArguments:constructorArguments.replace(/^0x/, ''),
        constructorArguements:constructorArguments.replace(/^0x/, '')}, true);
      const message = String(submitted.result);
      report(attempt, 'submit', submitted.status === '1' ? 'submitted, waiting for Etherscan to compile' : message);
      if (submitted.status === '1') { guid = message; onSubmitted(guid); }
      else if (/already verified/i.test(message)) {
        const confirmed = await confirmPublished();
        if (confirmed) return confirmed;
      } else if (!/unable to locate|not yet indexed|rate limit|temporarily|pending/i.test(message)) {
        throw Error(`Explorer rejected verification: ${clean(message)}`);
      }
    } else {
      const checked = await request({action:'checkverifystatus', guid});
      const message = String(checked.result);
      report(attempt, 'check', message);
      if (checked.status === '1' || /already verified/i.test(message)) {
        const confirmed = await confirmPublished();
        if (confirmed) return {...confirmed, guid};
      } else if (!/pending|in queue|rate limit|temporarily/i.test(message)) {
        throw Error(`Explorer verification failed: ${clean(message)}`);
      }
    }
    if (attempt + 1 < attempts) await pause(intervalMs);
  }
  throw Object.assign(Error(`Explorer verification timed out for ${address}.`), {code:'PENDING', guid});
}
