// WRITES to Hideki testnet. Needs PRIVATE_KEY (a dedicated burner holding a little STT).
// Every case records the docs claim, what the chain/SDK actually did, and tx hashes.
// Positions opened here are min-size and closed again before exit.
//
//   MARKET=ETH npx tsx probes/03-orders.ts
//
import { markets, save, within, canWrite, txUrl } from "./lib.ts";
import { parseUnits, type Address } from "viem";

if (!canWrite) { console.error("PRIVATE_KEY not set — this probe sends transactions."); process.exit(1); }

const me = markets.walletAddress as Address;
const SYM = process.env.MARKET ?? "ETH";
const rows: any[] = await within("listPerpMarkets", markets.client.listPerpMarkets());
const m = rows.find((r) => r.baseSymbol === SYM);
if (!m) throw new Error(`no market ${SYM}`);
const pool = m.poolAddress as Address, bank = m.marginBank as Address;
const tick = BigInt(m.tickSize), lot = BigInt(m.lotSize), minQ = BigInt(m.minQuantity);
const down = (x: bigint, g: bigint) => (g > 0n ? (x / g) * g : x);
const up = (x: bigint, g: bigint) => (g > 0n ? ((x + g - 1n) / g) * g : x);
const minSize = up(minQ, lot);

type Case = { id: string; claim: string; expected: string; actual?: string; ok?: boolean; txs: string[]; error?: any; data?: any };
const cases: Case[] = [];
const errInfo = (e: any) => ({ class: e?.constructor?.name, errorName: e?.errorName, reason: e?.reason, data: e?.data, functionName: e?.functionName, message: String(e?.shortMessage ?? e?.message ?? e).slice(0, 400) });
async function run(c: Case, fn: (c: Case) => Promise<void>) {
  console.log(`\n[${c.id}] ${c.claim}`);
  try { await fn(c); } catch (e: any) { c.error = errInfo(e); c.actual ??= `threw ${c.error.class}${c.error.errorName ? ` ${c.error.errorName}` : ""}`; }
  console.log(`  expected: ${c.expected}\n  actual:   ${c.actual}  ${c.ok === undefined ? "" : c.ok ? "OK" : "MISMATCH"}`);
  for (const t of c.txs) console.log(`  tx: ${txUrl(t)}`);
  cases.push(c);
}
const mark = async () => {
  const s: any = await within("state", markets.client.getPerpState(pool));
  if (!s.markPriceOk) throw new Error("mark stale");
  return BigInt(s.markPrice) as bigint;
};
const position = async () => (await within("pos", markets.client.getPerpPosition({ marginBank: bank, account: me, pool }))).size as bigint;
const place = (p: any) => markets.trader.placePerpOrder({ pool, ...p });

console.log(`account ${me} · ${SYM} pool ${pool} · tick ${tick} lot ${lot} min ${minQ}`);

// ---- C1 voucher
await run({ id: "C1-voucher", claim: "Any address can claim the 1,000 USDso perps credit once while flat", expected: "claim succeeds or account already holds it", txs: [] }, async (c) => {
  const el: any = await markets.client.getPerpVoucherEligibility(bank, me);
  c.data = el;
  if (el.eligible) { const r = await markets.trader.claimPerpVoucher({ marginBank: bank }); c.txs.push(r.hash); c.actual = `claimed (status ${r.receipt.status})`; c.ok = r.receipt.status === "success"; }
  else { c.actual = `not eligible: ${JSON.stringify(el.reason ?? el)}`; c.ok = true; }
});

const px = await mark();
const farBid = down(px * 80n / 100n, tick);   // never fills
const crossBuy = up(px * 102n / 100n, tick);  // crosses the ask
const crossSell = down(px * 98n / 100n, tick);

// ---- C2 quoter vs chain
await run({ id: "C2-max-size", claim: "getMaxPerpOrderSize returns the largest order the account can place", expected: "order at maxQuantity rests; maxQuantity + 1 lot reverts", txs: [] }, async (c) => {
  const q: any = await markets.client.getMaxPerpOrderSize({ pool, marginBank: bank, account: me, isBid: true, price: farBid });
  c.data = { quote: q };
  if (!q.priceable || !q.placeable) { c.actual = `not placeable: ${q.limitedBy}`; c.ok = false; return; }
  const a = await place({ isBid: true, price: farBid, quantity: q.maxQuantity });
  c.txs.push(a.hash);
  const atMax = `maxQuantity ${q.maxQuantity} rested id=${a.orderId}`;
  if (a.orderId !== undefined) { const x = await markets.trader.cancelOrder({ pool, orderId: a.orderId }); c.txs.push(x.hash); }
  let over = "accepted (quoter UNDER-states the max)";
  try { const b = await place({ isBid: true, price: farBid, quantity: q.maxQuantity + q.lotSize }); c.txs.push(b.hash); if (b.orderId !== undefined) { const x = await markets.trader.cancelOrder({ pool, orderId: b.orderId }); c.txs.push(x.hash); } }
  catch (e: any) { const i = errInfo(e); c.data.overError = i; over = `reverted ${i.errorName ?? i.data ?? i.message}`; }
  c.actual = `${atMax}; +1 lot ${over}`;
  c.ok = over.startsWith("reverted");
});

// ---- C3 FOK through placePerpOrder
await run({ id: "C3-fok", claim: "Orders docs list FOK; PlacePerpOrderParams.orderType JSDoc lists only 0 and 2", expected: "orderType 1 at a non-crossing price places nothing", txs: [] }, async (c) => {
  try { const r = await place({ isBid: true, price: farBid, quantity: minSize, orderType: 1 }); c.txs.push(r.hash); c.actual = `tx status ${r.receipt.status}, orderId=${r.orderId}, fills=${r.fills.length}`; c.ok = r.orderId === undefined && r.fills.length === 0;
    if (r.orderId !== undefined) { const x = await markets.trader.cancelOrder({ pool, orderId: r.orderId }); c.txs.push(x.hash); } }
  catch (e: any) { c.error = errInfo(e); c.actual = `reverted ${c.error.errorName ?? c.error.data}`; c.ok = true; }
});

// ---- C4 post-only / ALO through placePerpOrder
await run({ id: "C4-alo", claim: "ALO is rejected if any of it would fill immediately", expected: "orderType 3 at a crossing price is rejected and nothing fills", txs: [] }, async (c) => {
  const before = await position();
  try { const r = await place({ isBid: true, price: crossBuy, quantity: minSize, orderType: 3 }); c.txs.push(r.hash); c.actual = `tx status ${r.receipt.status}, orderId=${r.orderId}, fills=${r.fills.length}`; c.ok = r.fills.length === 0 && r.orderId === undefined;
    if (r.orderId !== undefined) { const x = await markets.trader.cancelOrder({ pool, orderId: r.orderId }); c.txs.push(x.hash); } }
  catch (e: any) { c.error = errInfo(e); c.actual = `reverted ${c.error.errorName ?? c.error.data}`; c.ok = true; }
  c.data = { positionBefore: before, positionAfter: await position() };
});

// ---- C5 IOC no fill
await run({ id: "C5-ioc-nofill", claim: "A single IOC that fills nothing reverts with ImmediateOrCancelNoFill() (0xd48c4403)", expected: "ContractRevertError with errorName ImmediateOrCancelNoFill", txs: [] }, async (c) => {
  try { const r = await place({ isBid: true, price: farBid, quantity: minSize, orderType: 2 }); c.txs.push(r.hash); c.actual = `did NOT revert: status ${r.receipt.status}, fills ${r.fills.length}`; c.ok = false; }
  catch (e: any) { c.error = errInfo(e); c.actual = `${c.error.class} errorName=${c.error.errorName} data=${String(c.error.data).slice(0, 10)}`; c.ok = c.error.errorName === "ImmediateOrCancelNoFill"; }
});

// ---- C6 wrong decimals
await run({ id: "C6-decimals", claim: "A wrong quantity scale 'does not fail with an error that says so'", expected: "SDK either rejects early or surfaces an actionable error", txs: [] }, async (c) => {
  const wrong = parseUnits("0.01", 18); // 18 regardless of the market's baseDecimals
  c.data = { baseDecimals: m.baseDecimals, wrongQuantity: wrong };
  if (m.baseDecimals === 18) { c.actual = "skipped: market uses 18 base decimals, pick MARKET=BTC/SOL"; return; }
  try { const r = await place({ isBid: true, price: farBid, quantity: wrong }); c.txs.push(r.hash); c.actual = "accepted?!"; c.ok = false; }
  catch (e: any) { c.error = errInfo(e); c.actual = `${c.error.class} ${c.error.errorName ?? ""} ${c.error.message.slice(0, 160)}`; c.ok = /decimal|scale|quantity/i.test(c.error.message); }
});

// ---- C7 no reduce-only: a "close" larger than the position flips it
await run({ id: "C7-no-reduce-only", claim: "Orders docs: reduce-only orders can only shrink a position, never open or flip one", expected: "a bot has some way to send a reduce-only close", txs: [] }, async (c) => {
  const p0 = await position();
  const open = await place({ isBid: true, price: crossBuy, quantity: minSize, orderType: 2 }); c.txs.push(open.hash);
  const p1 = await position();
  const close = await place({ isBid: false, price: crossSell, quantity: minSize * 2n, orderType: 2 }); c.txs.push(close.hash);
  const p2 = await position();
  c.data = { p0, afterOpen: p1, afterOversizedClose: p2, note: "PlacePerpOrderParams and PerpPool.placeOrder have no reduce-only field" };
  c.actual = `position ${p0} -> ${p1} -> ${p2}${p2 < 0n && p1 > 0n ? " (FLIPPED short)" : ""}`;
  c.ok = !(p2 < 0n && p1 > 0n);
  // flatten
  const p = await position();
  if (p !== 0n) { const f = await place({ isBid: p < 0n, price: p < 0n ? crossBuy : crossSell, quantity: p < 0n ? -p : p, orderType: 2 }); c.txs.push(f.hash); }
  c.data.final = await position();
});

// ---- C8 voucher-blocked market
await run({ id: "C8-voucher-blocked", claim: "Paper USDso blocks some markets; getMaxPerpOrderSize reports limitedBy 'voucherBlocked'", expected: "quoter says voucherBlocked and the order reverts", txs: [] }, async (c) => {
  for (const r of rows) {
    const s: any = await within("st", markets.client.getPerpState(r.poolAddress)); if (!s.markPriceOk) continue;
    const price = down(BigInt(s.markPrice) * 80n / 100n, BigInt(r.tickSize));
    const q: any = await markets.client.getMaxPerpOrderSize({ pool: r.poolAddress, marginBank: r.marginBank, account: me, isBid: true, price });
    if (q.priceable && q.limitedBy === "voucherBlocked") {
      const qty = up(BigInt(r.minQuantity), BigInt(r.lotSize));
      try { const x = await markets.trader.placePerpOrder({ pool: r.poolAddress, isBid: true, price, quantity: qty }); c.txs.push(x.hash); c.actual = `${r.baseSymbol}: quoter voucherBlocked but order ACCEPTED`; c.ok = false;
        if (x.orderId !== undefined) { const k = await markets.trader.cancelOrder({ pool: r.poolAddress, orderId: x.orderId }); c.txs.push(k.hash); } }
      catch (e: any) { c.error = errInfo(e); c.actual = `${r.baseSymbol}: quoter voucherBlocked, order reverted ${c.error.errorName ?? c.error.data}`; c.ok = true; }
      return;
    }
  }
  c.actual = "no voucher-blocked market found for this account"; c.ok = undefined;
});

console.log("\n==== SUMMARY");
for (const c of cases) console.log(`${c.ok === false ? "MISMATCH" : c.ok ? "ok      " : "n/a     "} ${c.id}: ${c.actual}`);
save(`03-orders-${SYM}`, { account: me, market: SYM, pool, cases });
await markets.close?.();
process.exit(0);
