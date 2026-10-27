# Paper-USDso voucher: `getPerpVoucherEligibility` says `eligible: true`, but `claim()` reverts with an undocumented error `0x3e31dcc2` for every fresh address

Severity: major
Area: contracts

## Steps to reproduce
1. `npm ci`
2. `npx tsx repro/006-voucher-eligible-but-claim-reverts.ts`. This is read-only and needs no wallet or gas. It generates a brand-new address and calls `client.getPerpVoucherEligibility(marginBank, address)`. It then builds the exact transaction the SDK would send with `trader.buildClaimPerpVoucher({ marginBank })` and simulates it with `eth_call` from that address, at the same block.
3. Run it as many times as you like. Each run uses a different never-used address.

## Expected
The [Perps developer page](https://app.dreamdex.io/docs/developers/perps-testnet#get-test-funds) says: "Any address can claim the 1,000 USDso perps credit once, as long as it holds no perp positions or orders", with the snippet `if (eligibility.eligible) await markets.trader.claimPerpVoucher(...)`. The SDK JSDoc (`dist/perp/voucher.d.ts` L45) adds: "The reasons are checked in the order `VoucherDistributor.claim()` checks them, so the reason names the revert a claim would produce at the same block."

So `eligible: true` should mean the claim succeeds.

## Actual
Every fresh address gets `eligible: true` (grant 1,000 USDso), and `claim()` on VoucherDistributor `0x2ACD9EFdA721450906bfE1bef3edE269636E42C4` reverts with selector **`0x3e31dcc2`**:

```
block 34868563
account 0x16d44B30dB857fBC2555F77aff6458Fb2d3CC7EA (fresh, never used)
getPerpVoucherEligibility -> eligible=true grant=1000000000000000000000
claim call -> to 0x2ACD9EFdA721450906bfE1bef3edE269636E42C4 data 0x4e71d92d…
eth_call claim(): REVERT data=0x3e31dcc2 Execution reverted for an unknown reason.
```

The same revert happened on a real send from a funded burner (`0xcBBB7c1Fac5fbacbf3fC40FB7b799fe5aCC772f2`, 0.45 STT on Hideki): `ContractRevertError: claim reverted: for an unknown reason.`, `data: 0x3e31dcc2`.

`0x3e31dcc2` is not in:
- the SDK's bundled error table (`dist/contractErrorsAbi.js`, 546 errors searched),
- the [Errors](https://app.dreamdex.io/docs/developers/contracts/errors) docs page (no voucher, distributor or credit errors are listed at all),
- the OpenChain or 4byte signature databases.

So a bot builder following the documented funding path has no paper USDso, no decoded reason, and an eligibility check that says it should have worked. The claim might be gated on something extra, such as joining the Perps Arena in the app. If so, neither the docs nor `getPerpVoucherEligibility` know about it. If it isn't gated, the distributor is broken for new addresses.

Suggested fix: add the missing check to `getPerpVoucherEligibility` (a new `reason`), add the error to the SDK error table and the Errors page, and state the real precondition on the developer page.

## Evidence
- `repro/006-voucher-eligible-but-claim-reverts.ts` output above (two runs, two fresh addresses, same selector).
- `evidence/03-orders-ETH.json`, case `C1-voucher`: `eligible: true` followed by the live revert `0x3e31dcc2` from `claim`.

## Environment
SDK `@somnia-chain/markets-sdk` 0.32.1 · Somnia Tokyo testnet (Hideki, chain 50383) · MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` · VoucherDistributor `0x2ACD9EFdA721450906bfE1bef3edE269636E42C4` · 2026-10-27
