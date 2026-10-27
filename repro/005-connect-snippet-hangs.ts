// The "Connect" snippet from app.dreamdex.io/docs/developers/perps-testnet, verbatim,
// read-only. Prints the BTC row and then... never exits.
import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

const markets = new SomniaMarkets({
  chain: hidekiTestnet,
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
});
const t0 = Date.now();
const perps = await markets.client.listPerpMarkets();
const btc = perps.find((m) => m.baseSymbol === "BTC")!;
console.log(`got ${perps.length} markets, BTC pool ${btc.poolAddress} in ${Date.now() - t0}ms — script body done`);
const cfg = await markets.client.getPerpSystemConfig(btc.marginBank);
console.log("system config read:", Object.keys(cfg).join(","), `at ${Date.now() - t0}ms`);
// Fix: await markets.close();   <- uncomment and the script exits
