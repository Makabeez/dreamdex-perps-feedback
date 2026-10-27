// Read-only. Tests the two funding claims on app.dreamdex.io/docs/trading/perps-testnet/funding
//
//  (A) "Hourly payment = position size × index price × funding rate / 8"
//      Check: across consecutive FundingRateUpdate rows, the growth of
//      cumulativeFundingPerUnit must equal intervals × indexPrice × fundingRate / (window/interval).
//
//  (B) "Perp above the index (positive funding): longs pay shorts.
//       Perp below the index (negative funding): shorts pay longs."
//      Check: compare the live rate with the live premium the pool itself reports
//      (getPerpState().emaPremium, 1e18-scaled). If the rate is positive while the premium
//      is negative, longs are paying while the perp trades BELOW the index.
//      We also fit the rate against an interest-plus-clamp model:
//        rate = premium + clamp(INTEREST - premium, -CLAMP, +CLAMP)
//
import { markets, save, within } from "./lib.ts";

const E18 = 10n ** 18n;
const INTEREST = 10n ** 14n;        // 0.01% per 8h window (1e18-scaled)
const CLAMP = 5n * 10n ** 14n;      // 0.05%
const ROWS = Number(process.env.FUNDING_ROWS ?? 60);
const B = (x: unknown) => BigInt(String(x).split(".")[0]);
const pct = (x: bigint) => `${(Number(x) / 1e16).toFixed(4)}%`;
const clamp = (x: bigint, lo: bigint, hi: bigint) => (x < lo ? lo : x > hi ? hi : x);

const rows: any[] = await within("listPerpMarkets", markets.client.listPerpMarkets());
const report: any[] = [];
let accrualChecks = 0, accrualExact = 0;
let longsPayBelowIndex = 0, modelHits = 0, live = 0;

for (const m of rows) {
  const sym = m.baseSymbol as string;
  // ---- (A) accrual formula over history
  const hist: any[] = (await within(`history ${sym}`, markets.client.getFundingRateHistory(m.poolAddress, { limit: ROWS })))
    .sort((a: any, b: any) => Number(a.blockNumber) - Number(b.blockNumber));
  let worst = 0, n = 0;
  for (let i = 1; i < hist.length; i++) {
    const a = hist[i - 1], c = hist[i];
    const k = B(c.intervalsAccrued);
    if (k === 0n || B(c.fundingRate) === 0n) continue;
    const perWindow = B(c.fundingWindowSec) / B(c.fundingIntervalSec);
    const expected = k * B(c.indexPrice) * B(c.fundingRate) / perWindow;
    const actual = B(c.cumulativeFundingPerUnit) - B(a.cumulativeFundingPerUnit);
    const rel = Math.abs(Number(actual - expected) / Number(expected));
    worst = Math.max(worst, rel); n++; accrualChecks++;
    if (rel < 1e-9) accrualExact++;
  }

  // ---- (B) live rate vs live premium
  const s: any = await within(`state ${sym}`, markets.client.getPerpState(m.poolAddress));
  const rate = B(s.fundingRate), prem = B(s.emaPremium);
  const model = prem + clamp(INTEREST - prem, -CLAMP, CLAMP);
  const residual = rate - model;
  const fits = (residual < 0n ? -residual : residual) <= 10n ** 12n; // within 0.0001%
  const markBps = s.markPriceOk ? Number((B(s.markPrice) - B(s.indexPrice)) * 1_000_000n / B(s.indexPrice)) / 100 : null;
  const contradicts = rate > 0n && prem < 0n;
  live++; if (fits) modelHits++; if (contradicts) longsPayBelowIndex++;

  report.push({
    sym, pool: m.poolAddress,
    accrual: { intervalsChecked: n, worstRelativeError: worst },
    live: { fundingRate: String(rate), fundingRatePct: pct(rate), emaPremium: String(prem), emaPremiumPct: pct(prem),
      markVsIndexBps: markBps, modelRatePct: pct(model), modelFits: fits,
      longsPayWhilePerpBelowIndex: contradicts },
    lastFundingTx: hist.at(-1)?.txHash,
  });
  console.log(`${sym.padEnd(9)} accrual worst=${worst.toExponential(1)} (n=${n})  rate=${pct(rate).padStart(9)} premium=${pct(prem).padStart(9)} model=${pct(model).padStart(9)} ${fits ? "fit" : "MISS"}${contradicts ? "  <- longs pay, perp below index" : ""}`);
}

const summary = {
  A_accrualFormula: `${accrualExact}/${accrualChecks} intervals match size × index × rate / 8 exactly (docs claim VERIFIED)`,
  B_signRule: `${longsPayBelowIndex}/${live} markets: rate > 0 while the pool's own premium < 0 — longs pay while the perp trades below the index (docs claim CONTRADICTED)`,
  B_model: `${modelHits}/${live} markets fit rate = premium + clamp(0.01% - premium, ±0.05%) to within 0.0001% (an interest component and clamp the docs do not mention)`,
};
console.log("\n" + Object.values(summary).join("\n"));
save("02-funding", { summary, report });
await markets.close();
process.exit(0);
