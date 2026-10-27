# dreamdex-perps-feedback

Reproducible feedback on dreamDEX Perps for the **dreamDEX Perps Builder Bounty**: the API, the `@somnia-chain/markets-sdk` SDK, and the docs, tested on Somnia Tokyo testnet (Hideki, chain 50383).

Every item lives in its own file under [`feedback/`](feedback/), in the bounty's template. Every claim comes with a script you can rerun. Nothing here is an opinion about the product; each item compares what the docs or SDK say with what the chain does.

## Run it (read-only, no wallet, ~1 minute)

```bash
npm ci
npm run judge      # probes/01-markets.ts + probes/02-funding.ts
```

Output goes to `evidence/*.json`, stamped with the time, SDK version, RPC and indexer it was captured against.

| Probe | What it checks | Needs a key |
|---|---|---|
| `probes/01-markets.ts` | Every perp market row against the pool's on-chain `getOrderBookParameters`, the MarginBank's `getPerpSystemConfig`, and the decimals, contract and funding tables in the docs | no |
| `probes/02-funding.ts` | The documented funding formula over 60 settlements per market, and the documented sign rule against the pool's own premium | no |
| `probes/03-orders.ts` | Order behaviour on a burner: voucher claim, max-size quoter vs chain, FOK, ALO, IOC no-fill, decimal mis-scaling, reduce-only, voucher-blocked markets | yes, a testnet burner with ~0.3 STT |
| `repro/005-connect-snippet-hangs.ts` | The docs' Connect snippet, verbatim | no |

```bash
cp .env.example .env    # PRIVATE_KEY = a dedicated testnet burner
npm run probe:orders    # MARKET=ETH by default
```

## Findings

| # | Item | Area | Severity | Verified by |
|---|---|---|---|---|
| 001 | [Funding docs give the wrong sign rule: longs pay while the perp trades below the index](feedback/001-funding-sign-rule-wrong-longs-pay-below-index.md) | docs | major | live, 21 markets, 1,239 settlements, re-run 2026-10-27 |
| 002 | [`placePerpOrder` JSDoc contradicts the pool's wallet auto-pull; no approve path](feedback/002-placePerpOrder-jsdoc-contradicts-auto-pull.md) | SDK | normal | SDK source |
| 003 | [`placePerpOrder` drops `userData`](feedback/003-placePerpOrder-drops-userData.md) | SDK | normal | SDK source |
| 004 | [No operator path for perps in the SDK (Link a Bot)](feedback/004-sdk-cannot-trade-perps-for-a-linked-wallet.md) | SDK | normal | SDK source |
| 005 | [Connect snippet never exits; `close()` undocumented](feedback/005-connect-snippet-never-exits.md) | docs | normal | live repro |

Also checked, and **consistent with the docs** (no item filed): all seven published contract addresses match `getPerpSystemConfig`; every market's base decimals match the docs table; tick, lot and minimum quantity match on-chain between the indexer and the pool; every market runs an 8h window settled hourly; the hourly payment formula `size × index × rate / 8` holds exactly. Known, already-documented pitfalls (for example `SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral` not being the perps collateral) are deliberately not filed.

## Scope and rules followed
- Security issues are not in this repo. They go privately to security@dreamdex.io.
- The order probe trades min-size on a burner and flattens before exiting. It never moves funds between bounty and Perps Arena accounts.
- Pinned to `@somnia-chain/markets-sdk` 0.32.1, the version the docs and the app use. Line references in the items point at that package's `dist/`.

## License
MIT
