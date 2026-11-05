// Public RPCs (e.g. publicnode) load-balance across nodes that are a block or two apart.
// A read pinned to the block one node just reported can land on a node that has not
// imported it yet and fail with "block not found" / "header not found". Those reads are
// safe to repeat: the block exists, it just has not reached that node yet.
const MISSING_BLOCK=/block not found|header not found|unknown block/i;

export function isMissingBlockError(e) {
  return [e?.error?.message,e?.info?.error?.message,e?.message].some(m=>MISSING_BLOCK.test(m??''));
}

export function withMissingBlockRetry(provider,{attempts=4,delayMs=400}={}) {
  if(provider.missingBlockRetry) return provider;
  const send=provider.send.bind(provider);
  provider.send=async(method,params)=>{
    for(let attempt=1;;attempt++) {
      try {return await send(method,params);}
      catch(e) {
        if(attempt>=attempts||!isMissingBlockError(e)) throw e;
        await new Promise(r=>setTimeout(r,delayMs*attempt));
      }
    }
  };
  provider.missingBlockRetry=true;
  return provider;
}
