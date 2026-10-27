// Read-only. No wallet, no gas: generates a throwaway address, asks the SDK whether it
// can claim the paper-USDso voucher, then simulates the exact claim() the SDK would send
// (eth_call from that address) and decodes the result.
//
//   npx tsx repro/006-voucher-eligible-but-claim-reverts.ts
//
import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, http, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const fresh = privateKeyToAccount(generatePrivateKey()); // never funded, never used
const markets = new SomniaMarkets({
  chain: hidekiTestnet,
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  privateKey: generatePrivateKey(), // only needed so trader.build* resolves; nothing is sent
});
const pub = createPublicClient({ chain: hidekiTestnet, transport: http(hidekiTestnet.rpcUrls.default.http[0]) });

const btc = (await markets.client.listPerpMarkets()).find((m: any) => m.baseSymbol === "BTC")!;
const bank = btc.marginBank as Address;
const block = await pub.getBlockNumber();

const elig: any = await markets.client.getPerpVoucherEligibility(bank, fresh.address);
console.log(`block ${block}`);
console.log(`account ${fresh.address} (fresh, never used)`);
console.log(`getPerpVoucherEligibility -> eligible=${elig.eligible}${elig.reason ? ` reason=${elig.reason}` : ""} grant=${elig.grantAmount ?? "-"}`);

const call = await markets.trader.buildClaimPerpVoucher({ marginBank: bank });
console.log(`claim call -> to ${call.to} data ${call.data.slice(0, 10)}…`);
try {
  await pub.call({ account: fresh.address, to: call.to, data: call.data, value: call.value, blockNumber: block });
  console.log("eth_call claim(): SUCCESS (no revert)");
} catch (e: any) {
  const data: string = e?.cause?.data ?? e?.data ?? e?.walk?.((x: any) => x?.data)?.data ?? "";
  console.log(`eth_call claim(): REVERT data=${data || "(none)"} ${String(e.shortMessage ?? e.message).split("\n")[0]}`);
}
await markets.close();
process.exit(0);
