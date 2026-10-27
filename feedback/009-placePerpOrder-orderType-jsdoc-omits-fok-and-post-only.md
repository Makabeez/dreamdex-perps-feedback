# `PlacePerpOrderParams.orderType` JSDoc lists only "0 limit or 2 market (IOC)", but FOK (1) and post-only/ALO (3) work on perps

Severity: normal
Area: SDK

## Steps to reproduce
1. `dist/trade.d.ts` L743, in `PlacePerpOrderParams`: `/** 0 limit (default) or 2 market (IOC). See {@link ORDER_TYPE}. */`
2. The perps [Orders](https://app.dreamdex.io/docs/trading/perps-testnet/orders) page lists GTC, IOC, **FOK** and **ALO** for perps.
3. Run `probes/03-orders.ts` (needs a testnet burner; see README). It sends `placePerpOrder` with `orderType: 1` at a non-crossing price, and with `orderType: 3` at a crossing price.

## Expected
The perp order params document all four order types the pool accepts, as `BatchOrderRequest.orderType` already does (L800: "0 limit (default), 1 FillOrKill, 2 market/IOC, 3 PostOnly").

## Actual
The perp pool accepts and enforces both types that the JSDoc leaves out, with correctly decoded errors (`evidence/03-orders-ETH.json`):

| Case | orderType | Result |
|---|---|---|
| C3 | 1 (FOK), price 20% below mark | reverted `FillOrKillNotFillable` |
| C4 | 3 (PostOnly/ALO), crossing price | reverted `PostOnlyWouldCross`, position unchanged |
| C5 | 2 (IOC), price 20% below mark | reverted `ImmediateOrCancelNoFill` (`0xd48c4403`), as documented |

A bot builder reading the SDK types would conclude that perps can't do FOK or post-only. Those are exactly what a maker bot needs, and what the trader docs advertise.

## Evidence
`evidence/03-orders-ETH.json`, cases C3–C5 (2026-10-27).

## Environment
SDK `@somnia-chain/markets-sdk` 0.32.1 · Somnia Tokyo testnet (Hideki, chain 50383) · burner `0xcBBB7c1Fac5fbacbf3fC40FB7b799fe5aCC772f2` · 2026-10-27
