# Docs say perp transactions cost 0.0003–0.003 STT, but with SDK defaults a wallet needs 0.6 STT before any write is accepted

Severity: normal
Area: docs

## Steps to reproduce
1. Fund a fresh bot key with 0.45 STT on Hideki. That's 150× the documented upper cost of one perp transaction.
2. Follow the [Perps developer page](https://app.dreamdex.io/docs/developers/perps-testnet): `new SomniaMarkets({ chain: hidekiTestnet, …, privateKey })`, then `trader.claimPerpVoucher(...)` or `trader.placePerpOrder(...)`.
3. Or read the SDK defaults: `dist/config.js` L50 sets `DEFAULT_FEES = { maxFeePerGas: 60000000000n, maxPriorityFeePerGas: 0n }` and documents the fixed 10,000,000 gas limit (L59): "× 60 gwei this is a 0.6 STT envelope; … the mempool admits a transaction only when the ceiling is [covered]".

## Expected
The page's funding advice works with the page's code. It says: "Gas is billed on what a transaction uses, not on its gas limit: transactions to perp pools measured on testnet cost between 0.0003 and 0.003 STT each", and its tip is "the bot kit sends every perp order with 10,000,000". A reader concludes that a few hundredths of STT is plenty.

## Actual
Every write from the 0.45 STT wallet was refused by the node (`insufficient balance`) before execution, because 10,000,000 gas × 60 gwei = **0.6 STT** has to be held up front, even though only about 0.001 is charged. Not one transaction was broadcast (`evidence/03-orders-ETH-default-fees.json`). The SDK then mislabels the refusal (item 007).

Passing `fees: { maxFeePerGas: 12_000_000_000n, maxPriorityFeePerGas: 0n }` to `SomniaMarkets` (Hideki's base fee is about 6 gwei; `eth_gasPrice` returned `0x165a0bc00`) brings the envelope to 0.12 STT. The same wallet then placed and was correctly refused FOK/ALO/IOC orders with properly decoded errors (`evidence/03-orders-ETH.json`). Neither the developer page nor the bot kit mentions this knob or the 0.6 STT minimum.

Suggested fix: under "Get test funds", state the minimum balance the SDK defaults require (0.6 STT, separate from what is actually charged), and show the `fees` override.

## Evidence
- `evidence/03-orders-ETH-default-fees.json` (defaults: every write refused) vs `evidence/03-orders-ETH.json` (12 gwei ceiling: writes reach the contract).
- Funding path used: Shannon faucet → SDK bridge (`createBridgeTransfer`, STT, Shannon → Hideki), tx `0xdba5d976e19f53d370e8e26928494db765dd84db7b84984f013c47acded23861` on Shannon (chain 50312), delivered in about 10 s.

## Environment
SDK `@somnia-chain/markets-sdk` 0.32.1 · Somnia Tokyo testnet (Hideki, chain 50383) · burner `0xcBBB7c1Fac5fbacbf3fC40FB7b799fe5aCC772f2` · 2026-10-27
