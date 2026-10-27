// No funds needed. Uses a fresh, UNFUNDED key, so the node refuses the transaction before
// execution ("insufficient balance" for the gas envelope). Shows how the SDK reports it.
//
//   npx tsx repro/007-insufficient-gas-reported-as-contract-revert.ts
//
// The same thing happens to a wallet holding real STT below 0.6: the SDK's fixed default
// envelope is 10,000,000 gas x 60 gwei = 0.6 STT (dist/config.js DEFAULT_FEES + gas default).
import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { generatePrivateKey } from "viem/accounts";

const markets = new SomniaMarkets({
  chain: hidekiTestnet,
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  privateKey: generatePrivateKey(),
});
const btc = (await markets.client.listPerpMarkets()).find((m: any) => m.baseSymbol === "BTC")!;
console.log(`signer ${markets.walletAddress} (balance 0 STT)`);

for (const [label, run] of [
  ["claimPerpVoucher", () => markets.trader.claimPerpVoucher({ marginBank: btc.marginBank })],
  ["placePerpOrder", () => markets.trader.placePerpOrder({ pool: btc.poolAddress, isBid: true, price: 10n ** 18n * 50_000n, quantity: BigInt(btc.minQuantity) })],
] as const) {
  try { await run(); console.log(`${label}: sent?!`); }
  catch (e: any) {
    console.log(`${label}:`);
    console.log(`  class        ${e?.constructor?.name}`);
    console.log(`  functionName ${e?.functionName}`);
    console.log(`  errorName    ${e?.errorName}`);
    console.log(`  data         ${e?.data}`);
    console.log(`  message      ${String(e?.message).split("\n")[0]}`);
    let c = e, root = ""; while (c?.cause) { c = c.cause; root = c?.message ?? root; }
    console.log(`  root cause   ${String(root).split("\n")[0]}`);
  }
}
await markets.close();
process.exit(0);
