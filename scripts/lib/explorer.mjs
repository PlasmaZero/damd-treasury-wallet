// Etherscan V2 standard-JSON verification. The fixed host keeps API keys off arbitrary URLs.
const endpoint = 'https://api.etherscan.io/v2/api';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function verifySource({address, contractName, constructorArguments = '', input,
  compilerVersion, apiKey, fetcher = fetch, pause = sleep, attempts = 60, intervalMs = 10000}) {
  if (!apiKey) throw Error('ETHERSCAN_API_KEY is required.');
  const clean = value => String(value).replaceAll(apiKey, '[redacted]').slice(0, 500);
  async function request(params, post = false) {
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
  }
  // Already-verified sources must still be retrievable as a usable verified contract.
  async function confirmPublished() {
    const result = await request({action:'getsourcecode', address});
    const source = result.status === '1' && Array.isArray(result.result) ? result.result[0] : null;
    if (!source?.SourceCode || !source.ABI || source.ABI === 'Contract source code not verified') return null;
    try { JSON.parse(source.ABI); } catch { return null; }
    if (source.ContractName !== contractName.split(':').at(-1)) throw Error('Explorer contract name mismatch.');
    if (source.CompilerVersion !== compilerVersion) throw Error('Explorer compiler version mismatch.');
    return {address, contractName, status:'verified', compilerVersion,
      url:`https://sepolia.etherscan.io/address/${address}#code`};
  }
  let guid = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!guid) {
      const submitted = await request({action:'verifysourcecode', contractaddress:address,
        sourceCode:JSON.stringify(input), codeformat:'solidity-standard-json-input', contractname:contractName,
        compilerversion:compilerVersion, optimizationUsed:'1', runs:'200', evmVersion:'paris',
        constructorArguments:constructorArguments.replace(/^0x/, '')}, true);
      const message = String(submitted.result);
      if (submitted.status === '1') guid = message;
      else if (/already verified/i.test(message)) {
        const confirmed = await confirmPublished();
        if (confirmed) return confirmed;
      } else if (!/unable to locate|not yet indexed|rate limit|temporarily|pending/i.test(message)) {
        throw Error(`Explorer rejected verification: ${clean(message)}`);
      }
    } else {
      const checked = await request({action:'checkverifystatus', guid});
      const message = String(checked.result);
      if (checked.status === '1' || /already verified/i.test(message)) {
        const confirmed = await confirmPublished();
        if (confirmed) return {...confirmed, guid};
      } else if (!/pending|in queue|rate limit|temporarily/i.test(message)) {
        throw Error(`Explorer verification failed: ${clean(message)}`);
      }
    }
    if (attempt + 1 < attempts) await pause(intervalMs);
  }
  throw Error(`Explorer verification timed out for ${address}.`);
}
