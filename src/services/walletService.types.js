/**
 * Service boundary (Story 0). Both implementations export createWalletService(config).
 * Addresses are checksummed; amounts are bigint wei; times are Unix seconds (number).
 * UI components import src/services, not ethers or contract ABI files.
 *
 * @typedef {{code:string,message:string,details?:string}} TxError
 * @typedef {{onSubmitted?:(hash:string)=>void}} WriteOpts
 * @typedef {{txHash:string,blockNumber:number,id?:number,wallet?:string}} WriteResult
 * @typedef {{count:number,needed:number,by:string[]}} VoteSummary
 * @typedef {'Pending'|'Queued'|'Ready'|'Executed'|'Cancelled'|'Expired'} ViewStatus
 * @typedef {{ok:boolean,error?:TxError}} Preview
 * @typedef {{blockNumber:number,logIndex:number,txHash:string,event:string,args:object}} HistoryItem
 *
 * Reads: connect(), getAccount(), onAccountOrChainChange(callback), listWallets(account),
 * addKnownWallet(address), snapshot(wallet), listProposals(wallet,{offset,limit}),
 * getProposal(wallet,id), listRecoveries(wallet,{offset,limit}), getRecovery(wallet,id),
 * getHistory(wallet), preview(wallet,method,args), subscribe(wallet,onInvalidate).
 *
 * Writes (all async; last argument WriteOpts): createWallet(config), deposit(wallet,wei),
 * proposePayment(wallet,recipient,wei), proposeAction(wallet,name,params),
 * approve/revokeApproval/voteCancel/execute(wallet,id),
 * initiateRecovery(wallet,oldOwner,newOwner),
 * approveRecovery/confirmRecovery/cancelRecovery/voteCancelRecovery/executeRecovery(wallet,id).
 *
 * Writes simulate before requesting a signature, call onSubmitted with the hash once
 * broadcast, and resolve only after one confirmation. They throw TxError on failure.
 * subscribe and onAccountOrChainChange return cleanup functions.
 *
 * Ready is UI-only: a Queued item whose chain timestamp is at least readyAt.
 * It does not guarantee execution: current quorum, caps, balance and membership are
 * still rechecked by the contract and transaction preview.
 */
export {};
