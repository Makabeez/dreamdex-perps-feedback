// Read-only. Cross-checks every perp market row against (a) the pool's own on-chain
// parameters, (b) the MarginBank's system config, and (c) the numbers the docs publish.
import { markets, pub, ADDRS, save, within } from "./lib.ts";
import type { Address } from "viem";

// Published on app.dreamdex.io/docs/developers/perps-testnet (captured 2026-10-21)
const DOC_BASE_DECIMALS: Record<string, number> = {
  ADA: 6, HYPE: 6, PUMP: 6, XRP: 6, XLM: 7, BTC: 8, DOGE: 8, ZEC: 8,
  SOL: 9, SUI: 9, TAO: 9, "1000PEPE": 18, AVAX: 18, BNB: 18, ETH: 18, LINK: 18,
  LIT: 18, VVV: 18, WLD: 18, ZRO: 18, NEAR: 24,
};
const DOC_CONTRACTS = {
  marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394",
  collateral: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",
  factory: "0xE631fAEE547baeE07353E290f0562ea67d856560",
  liquidationEngine: "0xA66d3C24Ad4a389d863846905D8173e1017e9F4D",
  insuranceFund: "0x50826894D47C6D4f3BeA38BFDC7Dc5c5be171b80",
};
const OB_PARAMS_ABI = [{
  type: "function", name: "getOrderBookParameters", stateMutability: "view", inputs: [],
  outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
}] as const;

const eq = (a?: string | null, b?: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

const rows = await markets.client.listPerpMarkets();
console.log(`perp markets: ${rows.length}`);
const findings: string[] = [];
const out: any[] = [];

const banks = [...new Set(rows.map((r: any) => r.marginBank as Address))];
const sys: Record<string, any> = {};
for (const b of banks) {
  console.log(`system config ${b}`);
  try { sys[b] = await within("getPerpSystemConfig", markets.client.getPerpSystemConfig(b)); } catch (e: any) { findings.push(`getPerpSystemConfig(${b}) failed: ${e.message}`); sys[b] = {}; }
  for (const [k, v] of Object.entries(DOC_CONTRACTS)) {
    const key = ({ collateral: "collateralToken", factory: "perpPoolFactory" } as Record<string, string>)[k] ?? k;
    const got = (sys[b] as any)[key];
    if (got === undefined) findings.push(`bank ${b}: getPerpSystemConfig has no field ${key}`);
    else if (!eq(got, v)) findings.push(`bank ${b}: ${key} on-chain ${got} != docs ${v}`);
  }
}
if (!eq((ADDRS as any).collateral, DOC_CONTRACTS.collateral))
  findings.push(`SOMNIA_HIDEKI_TESTNET_ADDRESSES.collateral = ${(ADDRS as any).collateral} (not perps collateral ${DOC_CONTRACTS.collateral}) — documented pitfall`);

const now = Date.now() / 1000;
for (const m of rows as any[]) {
  const sym = m.baseSymbol ?? m.baseToken;
  const r: any = { sym, pool: m.poolAddress, baseDecimals: m.baseDecimals, quoteDecimals: m.quoteDecimals,
    tickSize: m.tickSize, lotSize: m.lotSize, minQuantity: m.minQuantity, initialMarginBps: m.initialMarginBps,
    fundingWindowSec: m.fundingWindowSec, fundingIntervalSec: m.fundingIntervalSec, fundingRate: m.fundingRate,
    markPrice: m.markPrice, indexPrice: m.indexPrice, markPriceUpdatedAt: m.markPriceUpdatedAt,
    quoteToken: m.quoteToken, marginBank: m.marginBank, stopRegistry: m.stopRegistry };

  try {
    const [tick, minQ, lot] = (await within(`obparams ${sym}`, pub.readContract({ address: m.poolAddress, abi: OB_PARAMS_ABI, functionName: "getOrderBookParameters" } as any))) as readonly [bigint, bigint, bigint];
    r.onchain = { tickSize: tick, minQuantity: minQ, lotSize: lot };
    if (String(tick) !== String(m.tickSize)) findings.push(`${sym}: indexer tickSize ${m.tickSize} != on-chain ${tick}`);
    if (String(lot) !== String(m.lotSize)) findings.push(`${sym}: indexer lotSize ${m.lotSize} != on-chain ${lot}`);
    if (String(minQ) !== String(m.minQuantity)) findings.push(`${sym}: indexer minQuantity ${m.minQuantity} != on-chain ${minQ}`);
    if (lot > 0n && minQ % lot !== 0n) findings.push(`${sym}: minQuantity ${minQ} is not a multiple of lotSize ${lot} — the minimum order is unplaceable as written`);
  } catch (e: any) { r.onchainError = String(e.shortMessage ?? e.message); findings.push(`${sym}: getOrderBookParameters failed: ${r.onchainError}`); }

  const doc = DOC_BASE_DECIMALS[sym];
  if (doc === undefined) findings.push(`${sym}: live market missing from docs decimals table`);
  else if (doc !== m.baseDecimals) findings.push(`${sym}: docs say baseDecimals ${doc}, market row says ${m.baseDecimals}`);
  if (m.quoteDecimals !== 18) findings.push(`${sym}: quoteDecimals ${m.quoteDecimals} (docs: price always has 18 decimals)`);
  if (!eq(m.quoteToken, DOC_CONTRACTS.collateral)) findings.push(`${sym}: quoteToken ${m.quoteToken} != docs collateral`);
  if (![500, 1000, 2000].includes(m.initialMarginBps)) findings.push(`${sym}: initialMarginBps ${m.initialMarginBps} not one of the documented 20x/10x/5x tiers`);
  if (m.fundingWindowSec !== 28800 || m.fundingIntervalSec !== 3600) findings.push(`${sym}: funding window/interval ${m.fundingWindowSec}/${m.fundingIntervalSec}s (docs: 8h/1h for every market)`);
  if (m.markPriceUpdatedAt) { const age = now - Number(m.markPriceUpdatedAt); r.markAgeSec = Math.round(age); if (age > 3600) findings.push(`${sym}: mark price stale for ${Math.round(age / 60)} min in indexer`); }
  if (!m.stopRegistry) findings.push(`${sym}: no stopRegistry on market row (TP/SL impossible?)`);
  out.push(r);
}

for (const sym of Object.keys(DOC_BASE_DECIMALS))
  if (!out.find((r) => r.sym === sym)) findings.push(`${sym}: listed in docs decimals table but not returned by listPerpMarkets`);

console.log("\nFINDINGS:\n" + (findings.length ? findings.map((f) => " - " + f).join("\n") : " none"));
save("01-markets", { systemConfig: sys, markets: out, findings });
await markets.close();
process.exit(0);
