# DAMD user guide — draft for Milestone 5

Use the [hosted application](https://plasmazero.github.io/damd-treasury-wallet/)
with MetaMask on **Sepolia, chain 11155111**. Use test ETH only. Each signing
account needs its own Sepolia ETH for gas; the treasury does not pay its gas.

## Connect and select a treasury

1. Open the application and choose **Connect MetaMask**. Approve access to the
   account you intend to use, then check its displayed address and role.
2. Select a **Treasury wallet** or use **Add wallet by address** for a known
   treasury contract. The treasury address differs from your personal account.
3. Overview shows current owners, guardians, approval thresholds, balance,
   spending limits and delays. Roles belong to the selected treasury. Connecting
   an account grants no membership or spending rights.

Public state is readable without connecting. Accounts that are neither owners
nor guardians appear as **Observer** after connecting. If you cannot sign for the
default treasury's members, create a treasury with addresses you control.

Browser storage is optional. When it is blocked, the current session still works;
save the treasury address so you can add it again after reloading. Current owners
and guardians can also discover factory-created treasuries when connecting.

## Create a treasury and deposit

In **Create wallet**, enter unique owner and guardian addresses with no overlap.
Choose thresholds within the corresponding group sizes, then configure ETH caps
and delays in seconds. Read the warnings before choosing a one-member threshold
or requiring every member to remain accessible. Review the simulation, choose
**Confirm in MetaMask**, and sign. Wait for **Transaction confirmed** and record
the new treasury address.

Inline errors show the current owner/guardian counts and block review when a
threshold is invalid. Use whole numbers from 1 to the corresponding member count.
Governance also blocks a member removal that would leave fewer members than its
threshold; lower the threshold through an executed proposal first.

Anyone can deposit using **Overview → Add test funds → Review deposit**. Review
the amount and selected treasury, confirm in MetaMask, and wait for the balance
to update. Deposits do not use the outgoing payment allowance.

## Propose, approve and execute a payment

1. As an owner, open **Proposals**, enter the recipient and ETH amount, then
   review and sign the proposal. The proposer contributes the first approval.
2. Other owners connect their accounts and approve that proposal. Confirm the
   proposal ID and recipient before each signature.
3. Quorum queues the payment and starts its tier's timelock. **Ready** means that
   the delay elapsed; execution is a separate transaction by a current owner.
4. Review and execute. The contract rechecks current quorum, membership, caps,
   balance and expiry. Verify **Executed**, the balance change and Activity.

Pending approvals can be revoked. Cancelling a normal proposal needs
`N − M + 1` current owner votes, where N is the current owner count and M the
approval threshold. Cancellation transfers no funds. Expired, cancelled and
executed proposals cannot execute. The daily cap resets at the next UTC day.

## Change membership or rules

**Governance** supports adding, removing and replacing owners; owner thresholds;
guardian membership and thresholds; limits; and delays. A submitted change is
only a proposal. Owners approve it on **Proposals**, wait the governance delay,
then execute it. Check Overview after execution. Existing requests can become
blocked when current membership, quorum or limits change.

## Recover a lost owner address

1. A guardian opens **Recovery**, selects the lost owner, enters a fresh
   replacement address, reviews and signs. The initiating guardian counts once.
2. Other guardians approve until the guardian threshold is reached.
3. The replacement account connects and signs **Confirm new account**.
4. After the recovery delay, a current guardian or the replacement account signs
   **Execute recovery**. Verify the old address leaves membership and the new
   address becomes an owner. Treasury funds stay in the same contract.

Recovery replaces an owner address; it does not reconstruct a private key. The
targeted owner can **Cancel directly** while it controls its address. Alternatively,
M other owners can **Vote to cancel**; the target cannot contribute to that route.
A request marked **Invalidated** targets an owner membership already removed or
replaced. It cannot execute, but cancellation can still be available until expiry.

A stolen target key can veto recovery. Remaining owners need governance quorum
to replace that address. If neither owner quorum nor the recovery route remains
available, the software cannot bypass the treasury's authorization rules.

## Review transactions and activity

Every write has an application review and a MetaMask confirmation. Check the
signer, treasury and parameters at both steps. An account or network change closes
an open review. Rejecting a signature submits no transaction; reopen and review
the action if you want to retry. A submitted hash means pending, not successful.

**Activity** lists contract events with parameters and explorer links. Expand
**Members, parameters & timeline** on a proposal to inspect its vote history.
Use **Refresh** when necessary. One confirmation is the application's demo UX,
not a production finality guarantee.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Unexpected Observer role | Check the connected address, current membership and selected treasury. |
| Account did not switch | Check MetaMask site permissions, reconnect and verify the displayed address. |
| Execute is unavailable | Read the reason: quorum, delay, expiry, membership or replacement confirmation. |
| Insufficient gas | Fund the signing account with Sepolia ETH. A treasury balance does not fund its members. |
| RPC error | Verify Sepolia, refresh and inspect the submitted hash before retrying a write. |
| Simulation fails | Correct the stated condition; simulation success is still rechecked on chain. |
| Missing saved wallet after reload | Add its contract address again, or reconnect as a current member. |
| No deployment record | Report the hosted configuration problem; see the developer deployment guide. |

The [developer guide](DEVELOPER_GUIDE.md) covers local setup, reset and automated
checks. Actual MetaMask extension acceptance still requires a manual walkthrough.
