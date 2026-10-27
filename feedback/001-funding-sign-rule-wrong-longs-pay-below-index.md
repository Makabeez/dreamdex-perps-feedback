# Funding docs give the wrong sign rule: longs pay while the perp trades below the index (11–17 of 21 markets in two snapshots)

Severity: major
Area: docs

## Steps to reproduce
1. `npm ci && npm run probe:funding` (read-only, no key, ~40 s), or run `probes/02-funding.ts` directly.
2. For every perp market it reads the live `getPerpState()` (`fundingRate`, `emaPremium`) and the last 60 `getFundingRateHistory()` rows.
3. It checks the two claims on [Funding](https://app.dreamdex.io/docs/trading/perps-testnet/funding):
   - (A) "Hourly payment = position size × index price × funding rate / 8"
   - (B) "Perp below the index (negative funding): shorts pay longs."

## Expected
Per the docs, a market whose perp trades below the index has a negative rate, so shorts pay longs.

## Actual
(A) is exactly right. All **1,239 / 1,239** indexed settlements satisfy `ΔcumulativeFundingPerUnit = intervals × indexPrice × fundingRate / 8` with zero error.

(B) does not hold. On most markets the pool's own premium (`emaPremium`) is negative, yet `fundingRate` is positive, so **longs pay** while the perp trades below the index. It held on **17 / 21** markets on 2026-10-21 and on **11 / 21** markets on 2026-10-27. Examples from the 2026-10-27 snapshot in `evidence/02-funding.json`:

| Market | emaPremium | fundingRate | Who pays per docs | Who actually pays |
|---|---|---|---|---|
| XRP | −0.0410% | +0.0090% | shorts | longs |
| ETH | −0.0112% | +0.0100% | shorts | longs |
| ZEC | −0.0039% | +0.0100% | shorts | longs |
| NEAR | −0.0036% | +0.0100% | shorts | longs |
| LINK | −0.0009% | +0.0100% | shorts | longs |

The rate fits this model on **21 / 21** markets to within 0.0001%:

```
rate = premium + clamp(0.01% − premium, −0.05%, +0.05%)     (per 8h window)
```

That is an interest component of 0.01% per 8h plus a ±0.05% clamp, the Binance/Hyperliquid shape. The page mentions neither. In practice the rate floors at +0.01% whenever the premium is between about −0.04% and 0, and it only turns negative once the premium goes below −0.04% (2026-10-27: HYPE premium −0.0863% gives rate −0.0363%; 2026-10-21: LIT premium −0.0639% gives rate −0.0139%; the model reproduces both exactly).

The SDK's own JSDoc (`dist/perp/state.d.ts`, `emaPremium`) also says the premium is an impact-price, time-weighted quantity with a deadband, "NOT mark vs index". The trader-facing page presents the plain mark-vs-index rule instead.

Why it matters: carry and basis bots, and anyone reading the page to decide which side earns funding, get the sign wrong in the regime most markets are in today. A short opened to "collect" funding on a perp trading under its index pays 0.01% per 8h instead.

Suggested fix: document the actual formula (interest rate, clamp bounds, impact-price premium and its deadband), and state that a slightly negative premium still yields a positive rate.

## Evidence
- `evidence/02-funding.json`: per-market rate, premium, model prediction, worst accrual error, and the last funding settlement tx for each pool.
- Example settlement txs (BTC, ETH): see `report[].lastFundingTx` in that file. The explorer base is `https://smk-dev-markets-explorer-hideki-euw4-uzavbo36ra-ez.a.run.app/tx/<hash>`.
- Reads used: `client.getPerpState(pool)`, `client.getFundingRateHistory(pool, { limit: 60 })`.

## Environment
SDK `@somnia-chain/markets-sdk` 0.32.1 · Somnia Tokyo testnet (Hideki, chain 50383) · RPC `api.hideki2.infra.testnet.somnia.network` · indexer `hideki-dev.smk.somnia.host` · read-only, no wallet · captured 2026-10-21 and re-verified 2026-10-27
