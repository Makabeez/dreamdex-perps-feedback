# `placePerpOrder` JSDoc says margin only comes from the MarginBank ("deposit first"), but the pool auto-pulls from the wallet, and the SDK never approves for it

Severity: normal
Area: SDK

## Steps to reproduce
1. `npm i @somnia-chain/markets-sdk@0.32.1`
2. Read the docs for `Trader.placePerpOrder` in `dist/trade.d.ts` (L722-729, `PlacePerpOrderParams`):
   > Margin is locked from the signer's MarginBank balance (no escrow transfer in this tx) — `Trader.depositMargin` first.
3. Read the implementation in `dist/orders.js`:
   - L1614 (`perpOrderCall`): `// No w.escrow step: margin is locked w.from the signer's MarginBank balance (deposit first)`
   - L1684 (`buildPlacePerpOrder`): `// No approval ever: margin comes from the MarginBank balance, not an escrow transfer`
4. Compare with the SDK's own sizing docs:
   - `dist/somniaMarketsClient.d.ts` L3482 (`getMaxPerpOrderSize`): "Pass `autoPull` when the transaction sender will be the order owner. That is the pool's whole gate for topping the account up from its wallet (T70) … an account with an empty bank and a funded, approved wallet goes from a max of `0n` to whatever the wallet funds."
   - `dist/perp/margin.d.ts` L1190: "`PerpPool._autoPullMargin` returns early unless `msg.sender == order.owner` … `allowance` [is] their approval to the **MarginBank**".
5. Compare with the [Perps developer page](https://app.dreamdex.io/docs/developers/perps-testnet): "The owner's own `placeOrder` fails differently, with `ERC20: transfer amount exceeds balance`, because the pool tries to pull the shortfall from the wallet."

## Expected
One consistent story. Either `placePerpOrder` documents that the pool tops up the shortfall from the owner's wallet (and offers `autoApprove` to the MarginBank, like `depositMargin` does), or the pool does not auto-pull.

## Actual
Three SDK places say margin is bank-only and nothing is approved. Two other SDK places and the docs say the pool pulls the shortfall from the wallet through the MarginBank allowance.

`placePerpOrder` has no `autoApprove`, and the Trader has no MarginBank-approve helper. So the auto-pull path can only succeed if an earlier `depositMargin` happened to leave enough allowance. `getMaxPerpOrderSize({ autoPull: true })` can return `limitedBy: "walletAllowance"`, but there is no SDK verb to clear it other than `depositMargin`.

## Evidence
SDK source references above (0.32.1, `dist/`). A live confirmation (an order placed with an empty bank and an approved wallet) is in `evidence/03-orders-*.json` if attached.

## Environment
SDK `@somnia-chain/markets-sdk` 0.32.1 · Somnia Tokyo testnet (Hideki, chain 50383) · static review of the published package
