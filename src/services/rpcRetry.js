// Public RPCs (e.g. publicnode) load-balance across nodes that are a block or two apart.
// A read pinned to the block one node just reported can land on a node that has not
// imported it yet and fail with "block not found" / "header not found". Those reads are
// safe to repeat: the block exists, it just has not reached that node yet.
const MISSING_BLOCK=/block not found|header not found|unknown block/i;
// The same pools mix archive and pruned nodes: a log or state read for older blocks
// fails on a pruned node (publicnode: code 4444 "pruned history unavailable") but the
// identical request succeeds on the next node it is routed to. Shrinking the range does
// not help, so these are retried as-is.
const PRUNED_HISTORY=/pruned history|history unavailable|missing trie node/i;
const messages=e=>[e?.error?.message,e?.info?.error?.message,e?.message];

export function isMissingBlockError(e) {
  return messages(e).some(m=>MISSING_BLOCK.test(m??''));
}

export function isPrunedHistoryError(e) {
  return e?.error?.code===4444||e?.info?.error?.code===4444||messages(e).some(m=>PRUNED_HISTORY.test(m??''));
}

// Errors from one node in a load-balanced pool that another node will not repeat.
export const isNodeError=e=>isMissingBlockError(e)||isPrunedHistoryError(e);

export function withMissingBlockRetry(provider,{attempts=4,delayMs=400}={}) {
  if(provider.missingBlockRetry) return provider;
  const send=provider.send.bind(provider);
  provider.send=async(method,params)=>{
    for(let attempt=1;;attempt++) {
      try {return await send(method,params);}
      catch(e) {
        if(attempt>=attempts||!isNodeError(e)) throw e;
        // A pruned node is not catching up; the retry just needs to reach a different node.
        await new Promise(r=>setTimeout(r,isPrunedHistoryError(e)?Math.min(delayMs,100):delayMs*attempt));
      }
    }
  };
  provider.missingBlockRetry=true;
  return provider;
}
