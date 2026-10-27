# SDK reports node-side gas rejections ("insufficient balance", "account does not exist") as `ContractRevertError: <fn> reverted: Missing or invalid parameters`

Severity: normal
Area: SDK

## Steps to reproduce
1. `npm ci`
2. `npx tsx repro/007-insufficient-gas-reported-as-contract-revert.ts`. It uses a fresh, unfunded key, so no funds are needed. It calls `trader.claimPerpVoucher` and `trader.placePerpOrder` on BTC and prints the error class, fields and root cause.

## Expected
A transaction the node refuses before execution (the wallet can't cover the gas envelope) surfaces as an RPC or funding error that says so, for example `RpcError` with "insufficient funds for gas". It should not look like a contract revert, and nothing in it should suggest the call's arguments were wrong.

## Actual
Both writes throw `ContractRevertError` with a message that says the contract reverted because of bad parameters:

```
signer 0x58f46494907b6C806eE207a0864C20e4944657a3 (balance 0 STT)
claimPerpVoucher:
  class        ContractRevertError
  functionName claim
  errorName    undefined
  data         0x02
  message      @somnia-chain/markets-sdk: claim reverted: Missing or invalid parameters.
  root cause   account does not exist
placePerpOrder:
  class        ContractRevertError
  functionName placeOrder
  errorName    undefined
  data         0x02
  message      @somnia-chain/markets-sdk: placeOrder reverted: Missing or invalid parameters.
  root cause   account does not exist
```

The same happens to a wallet that does hold STT but less than the SDK's default 0.6 STT envelope (see item 008). Then `data` is `0x03` and the buried root cause is `insufficient balance`. A real burner holding 0.45 STT got `ContractRevertError … placeOrder reverted: Missing or invalid parameters.` for every write (`evidence/03-orders-ETH-default-fees.json`, cases C1, C3, C4, C5, C7).

That sends developers the wrong way: they re-check prices, decimals and lot sizes, which the docs warn about at length, when the fix is funding the wallet or lowering `fees`. It also breaks code that branches on `ContractRevertError` to mean "the contract said no". The `0x02`/`0x03` in `data` is a node status code, not revert data, but it looks like revert data.

## Evidence
- Output above (2026-10-27, block ≈34.87M).
- `evidence/03-orders-ETH-default-fees.json`: five writes from a 0.45 STT wallet, all `ContractRevertError` with `data: 0x03` and reason "Missing or invalid parameters". Not one transaction was broadcast.

## Environment
SDK `@somnia-chain/markets-sdk` 0.32.1 · viem 2.57.7 · Node 22.22 · Somnia Tokyo testnet (Hideki, chain 50383) · 2026-10-27
