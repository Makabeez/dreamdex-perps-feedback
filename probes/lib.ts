// Shared setup for every probe. Read-only unless PRIVATE_KEY is set.
import { writeFileSync, mkdirSync } from "node:fs";
import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, http, type Address } from "viem";

export const INDEXER = process.env.INDEXER_URL ?? "https://hideki-dev.smk.somnia.host/v1/graphql";
export const RPC = hidekiTestnet.rpcUrls.default.http[0];
export const EXPLORER = "https://smk-dev-markets-explorer-hideki-euw4-uzavbo36ra-ez.a.run.app";
export const SDK_VERSION = "0.32.1";

const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;

export const markets = new SomniaMarkets({
  chain: hidekiTestnet,
  indexerUrl: INDEXER,
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  ...(pk ? { privateKey: pk } : {}),
});

export const pub = createPublicClient({ chain: hidekiTestnet, transport: http(RPC) });
export const ADDRS = SOMNIA_HIDEKI_TESTNET_ADDRESSES;
export const canWrite = Boolean(pk);

export const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2);

export function save(name: string, data: unknown) {
  mkdirSync("evidence", { recursive: true });
  const file = `evidence/${name}.json`;
  writeFileSync(file, json({ capturedAt: new Date().toISOString(), sdk: SDK_VERSION, rpc: RPC, indexer: INDEXER, data }));
  console.log(`  -> ${file}`);
  return file;
}

export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export type { Address };

/** Fail a read loudly instead of hanging forever. */
export async function within<T>(label: string, p: Promise<T>, ms = 20_000): Promise<T> {
  let t: NodeJS.Timeout;
  const timer = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms: ${label}`)), ms); });
  try { return await Promise.race([p, timer]); } finally { clearTimeout(t!); }
}
