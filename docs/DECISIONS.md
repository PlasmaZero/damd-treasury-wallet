# Implementation decisions and specification differences

The two original supplied documents are preserved as INPUT_STORIES.txt and INPUT_CONTEXT.txt.
This implementation follows the story's concrete interfaces and Ganache workflow.
The older context recommends a future Foundry migration; that migration is not implemented.

## Preserved public boundaries

- ITreasury and ITreasuryFactory public declarations, enum order and event/error names.
- Solidity 0.8.24, optimizer 200, EVM paris, Ganache merge, local chain 1337.
- ActionType parameter tuples, separate proposal/recovery ID sequences.
- 0-based IDs; bigint wei; Unix-second times; derived Expired status; UI-only Ready.
- Proposer/initiator auto-approval; timers only start at first queue transition.
- Per-payment cap and UTC fixed-day aggregate cap, checked at execution.
- Recovery requires new-address confirmation; cancellation by target or M other owners.
- Factory indexes members at creation and has no admin privileges.
- WalletService methods and mock/real switching through VITE_USE_MOCK.

## Deliberate internal safety changes

The internal voting storage extends the sketch with **membership generations**. Votes
record the member's generation when cast. Removing/replacing a member makes those votes
inactive; re-adding the same address increments its generation, so old votes cannot revive.
The ABI is unchanged. The recovery also remembers the target's generation, preventing a
stale recovery from targeting a later rejoined membership. A regression test covers
remove/re-add vote invalidation. The internal sketches were not a merged repository here;
review these changes jointly with the contract and frontend leads before merging.

Static governance tuples require canonical lengths and address/uint64 padding, so malformed
parameters produce InvalidAction instead of an undecodable fallback revert.
All mutating proposal and recovery entry points share a storage-based ReentrancyGuard.
The payment receiver cannot reenter another state-mutating action during execution.

## Explicit scope choices

- Unanimous fast path is omitted. Later approvals never alter readyAt.
- The mock supports roles and main lifecycle rules, but is not a second exact security
  implementation. Historical fixture events are illustrative, and some governance
  validation errors use a descriptive message rather than the contract's exact code.
- Tests use Node + Ganache + fast-check. Slither/Foundry and exhaustive formal invariants
  are not included. See the coverage record for what was actually tested.
- Browser tests inject a local EIP-1193 adapter. Actual MetaMask interaction needs a manual
  walkthrough; no automated-extension claim is made.
- Ethereum chain reorg/finality UX, indexing large histories, and production RPC resilience
  are beyond this demo. One confirmation and authoritative snapshot rereads are used.
- Local deployment is tested. Sepolia script and frontend configuration are provided;
  funding, deployment, explorer verification, hosting, and GitHub settings are not performed.

## Security assumptions

M compromised owners can authorize actions under the current limits; K malicious guardians
can queue recovery. Honest parties must monitor and cancel during the timelock. Limits and
delays reduce exposure but cannot guarantee prevention of collusion. A 1-of-1 configuration
is allowed by the frozen spec, so its owner controls actions alone. Use demo funds only.

## Primary technical references

- ethers v6 contracts/providers: https://docs.ethers.org/v6/single-page/
- OpenZeppelin utilities: https://docs.openzeppelin.com/contracts/5.x/api/utils
- Dependency versions are pinned; source verification uses the emitted standard JSON input.
