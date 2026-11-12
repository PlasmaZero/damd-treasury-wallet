// Keep a slow history read alive across block refreshes. Only wallet/tab changes
// dispose the loader; newer blocks request one follow-up read instead of making
// the in-flight result obsolete.
export function createHistoryLoader(load,onChange) {
  let disposed=false,running=false,queued=false;
  let state={items:[],loading:false,error:''};
  const publish=next=>{if(!disposed){state=next;onChange(state);}};
  async function refresh() {
    if(disposed)return;
    if(running){queued=true;return;}
    running=true;publish({...state,loading:true});
    try {
      const items=await load();
      publish({items,loading:false,error:''});
    } catch(error) {
      publish({...state,loading:false,error:error?.shortMessage||error?.message||'Event history could not be loaded. Try again.'});
    } finally {
      running=false;
      if(queued&&!disposed){queued=false;void refresh();}
    }
  }
  return {refresh,dispose(){disposed=true;queued=false;}};
}
