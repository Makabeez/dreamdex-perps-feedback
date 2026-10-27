# `placePerpOrder` cannot set `userData`: it is hard-coded to `0n`, unlike spot orders and batch requests

Severity: normal
Area: SDK

## Steps to reproduce
1. `npm i @somnia-chain/markets-sdk@0.32.1`
2. `dist/trade.d.ts`: `PlaceSpotOrderParams` has `userData?: bigint` ("Opaque market-maker bookkeeping tag, forwarded verbatim", L450), and so does `BatchOrderRequest` (L808). `PlacePerpOrderParams` (L729) has no `userData` field.
3. `dist/orders.js`, `perpOrderCall` (L1610-1625) builds `placeOrder(isBid, 0n, price, …)`: the second argument, `uint64 userData`, is the literal `0n`.

```ts
// TypeScript rejects this, and even with a cast the tag is dropped
await markets.trader.placePerpOrder({ pool, isBid: true, price, quantity, userData: 42n })
```

## Expected
Perp single-order placement forwards `userData`, as spot does. The PerpPool's `placeOrder` takes it: `placeOrder(bool isBid, uint64 userData, …)` in `perpPoolWriteAbi`.

## Actual
A perp bot cannot tag single orders for its own bookkeeping (strategy id, ladder rung, client order id) through the SDK. It has to use the batch path or hand-encode the call.

## Evidence
SDK source references above. The PerpPool ABI the SDK ships (`dist/tradeAbi.js`, `perpPoolWriteAbi`) has `placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)`.

## Environment
SDK `@somnia-chain/markets-sdk` 0.32.1 · Somnia Tokyo testnet (Hideki, chain 50383) · static review of the published package
