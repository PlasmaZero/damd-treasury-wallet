# Manual demo and acceptance checklist

Use disposable local accounts and test ETH only. Always verify the connected address
shown in the top bar after switching MetaMask accounts. Approve MetaMask requests only
when the displayed contract address and value match the website's preview.

## Start clean

- [ ] `npm ci`; Terminal 1: `npm run chain`.
- [ ] Terminal 2: `npm run deploy`, then `npm run dev`.
- [ ] Add local network RPC `http://127.0.0.1:8545`, ID `1337`, symbol `ETH`.
- [ ] Import local demo accounts printed by the chain. Select account 0 and connect.
- [ ] Dashboard: 0 ETH, 3-of-5 owners, 2-of-3 guardians.

## Payments

- [ ] Account 0 deposits 2 ETH; balance updates only after confirmation.
- [ ] Propose 0.1 ETH to account 9; proposer auto-approval shows 1/3.
- [ ] Account 1 approves → 2/3; account 2 approves → Queued, 3/3.
- [ ] Before 15 seconds: Execute disabled; after: Ready.
- [ ] Execute as an owner → recipient receives 0.1 ETH; wallet shows 1.9 ETH.
- [ ] The executed item cannot execute again. Activity includes Payment Sent / Executed.
- [ ] Try 2.1 ETH: per-payment cap prevents creation.
- [ ] Propose 1 ETH: queue with 3 approvals; delay is 60 seconds.
- [ ] Cancel it using accounts 0, 1, and 2: N−M+1=3 cancel votes.
- [ ] Use account 9: it can deposit/read, but cannot approve/propose/execute.

## Governance

- [ ] As account 0, propose Add Owner for account 10.
- [ ] Accounts 1 and 2 approve; wait the current 120-second governance delay.
- [ ] Execute: account 10 appears in Owners. N becomes 6 and cancel threshold becomes 4.
- [ ] The new owner manually adds this wallet by address if it is absent from discovery.
- [ ] Verify changing a limit or delay also requires a proposal and the existing delay.

## Lost-owner recovery

- [ ] Account 5 (guardian) initiates replacement of owner 4 with account 8.
- [ ] Account 6 approves → Queued, 2/2; recovery waits 180 seconds.
- [ ] Switch to account 8; open Recovery and Confirm new account.
- [ ] After delay, account 8 or a guardian executes recovery.
- [ ] Account 4 no longer has owner rights; account 8 does. Funds are unchanged.

## Recovery veto

- [ ] Guardian 5 initiates recovery of owner 3 to account 11.
- [ ] Switch to account 3: the prominent recovery banner appears on every page.
- [ ] Cancel directly. The recovery cannot execute.
- [ ] For a second request, try owner-vote cancellation with three other current owners.

## Wallet creation and errors

- [ ] Create an independent wallet with non-overlapping owner/guardian arrays.
- [ ] Duplicate/zero/overlapping addresses and impossible thresholds fail validation.
- [ ] Cancel a MetaMask signature: the UI reports rejection and remains usable.
- [ ] Switch to a wrong chain: writes fail with a network message.
- [ ] Switch back, reconnect, and refresh: role and balances update.
- [ ] Background the tab while another account transacts; refocus and confirm refreshed state.
- [ ] On a narrow mobile viewport, forms and controls remain usable.

The automated browser test covers connect, deposit, multi-account approval/execution,
governance, full recovery, history, and narrow layout using a local wallet adapter.
This manual checklist is for the actual MetaMask extension; do not mark it complete
merely because automation passes.
