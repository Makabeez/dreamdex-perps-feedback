# The perps "Connect" snippet leaves the Node process running forever after the first chain read; `close()` is never mentioned

Severity: normal
Area: docs

## Steps to reproduce
1. `npm ci`
2. `npx tsx repro/005-connect-snippet-hangs.ts`. This is the [Connect](https://app.dreamdex.io/docs/developers/perps-testnet#connect) snippet verbatim, plus the `getPerpSystemConfig(marginBank)` check that the same page calls "the check worth running before trusting any list".
3. Measure: `timeout 45 npx tsx repro/005-connect-snippet-hangs.ts; echo $?`

## Expected
A read-only script that has finished its work exits.

## Actual
Both reads complete in about 1.7 s and print, then the process stays alive until killed (`exit=124` after 45 s). The WebSocket the SDK opens for chain reads keeps the event loop alive. Indexer-only reads such as `listPerpMarkets()` alone do exit, so the hang shows up only once a chain read happens, which makes it look intermittent.

Uncommenting `await markets.close();` makes the same script exit in about 4 s. `SomniaMarkets.close()` exists (`dist/unified/exchange.d.ts` L2646) and the README mentions it, but the perps developer page never does. For cron jobs, CI checks and one-shot bot scripts, that turns into hung jobs and leaked sockets.

Suggested fix: end the Connect snippet with `await markets.close()` and add one line under "Common pitfalls".

## Evidence
```
got 21 markets, BTC pool 0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0 in 684ms — script body done
system config read: marginBank,collateralToken,perpPoolFactory,liquidationEngine,insuranceFund,feeRecipient,maxLeverageLimit,fullyWired at 1655ms
exit=124 after 45s          # killed by timeout
--- with await markets.close():
exit=0 after 4s
```

## Environment
SDK `@somnia-chain/markets-sdk` 0.32.1 · Node 22.22 · Somnia Tokyo testnet (Hideki, chain 50383) · read-only, no wallet · 2026-10-21
