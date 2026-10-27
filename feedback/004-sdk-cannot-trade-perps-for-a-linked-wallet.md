# Missing feature: the SDK has no operator path for perps, so "Link a Bot" trading cannot go through `@somnia-chain/markets-sdk`

Severity: normal
Area: SDK

## Steps to reproduce
1. The [Perps developer page](https://app.dreamdex.io/docs/developers/perps-testnet#trade-an-app-wallet-with-a-bot) tells bot builders to link a key to their app wallet ("the key can then place, cancel and reduce orders for that wallet"), and describes `placeOrderFor` / `placeOrdersFor` / `amendOrders` on perp pools.
2. `npm i @somnia-chain/markets-sdk@0.32.1` and list the perp-pool write ABI the SDK ships:

```bash
# dist/ is not in the package "exports", so import the file by path
node --input-type=module -e 'const m = await import(process.argv[1]); console.log(m.perpPoolWriteAbi.filter(f=>f.type==="function").map(f=>f.name))' "$PWD/node_modules/@somnia-chain/markets-sdk/dist/tradeAbi.js"
# [ 'placeOrder', 'cancelOrder', 'updateFunding', 'marginBank' ]
```

3. `Trader.placePerpOrder` always calls `placeOrder` as `msg.sender` (`dist/orders.js`, `perpOrderCall`). No perp verb takes an `owner`. The SDK's own operator selectors (`placeOrderFor`, `cancelOrderFor`, `reduceOrderFor`) live only under `spot/operatorGrants`, and binary has `placeBinaryOrderFor`.

## Expected
A perp operator verb (for example `placePerpOrderFor({ owner, … })` and `cancelPerpOrderFor`) that matches the documented Link a Bot flow, so a bot using the official SDK can trade the app wallet it was linked to.

## Actual
The documented bot workflow requires hand-encoding `placeOrderFor` against the pool, with every gotcha the docs list (base-decimal scaling, the 10M gas floor, `InsufficientCollateral` on a wrong scale). The official SDK can only trade perps as the owner key itself. That also means the owner's hot key has to sit on the bot host, which is the exact risk Link a Bot exists to avoid.

## Evidence
ABI listing above (0.32.1). `grep -rn "placeOrderFor" node_modules/@somnia-chain/markets-sdk/dist --include=*.d.ts` only hits spot and binary files, plus comments in `perp/margin.d.ts` and `perp/history.d.ts` that tell the reader `placeOrderFor` exists.

## Environment
SDK `@somnia-chain/markets-sdk` 0.32.1 · Somnia Tokyo testnet (Hideki, chain 50383) · static review of the published package
