import type { Metadata } from "next";
import { CashbookView } from "@/components/cashbook-view";
import { requireShop } from "@/lib/auth";
import { getCashbook } from "@/lib/data";
import type { SearchParams } from "@/lib/dates";

export const metadata: Metadata = { title: "Cashbook" };
export default async function CashbookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { shop } = await requireShop();
  return <CashbookView {...await getCashbook(await searchParams)} shop={shop} />;
}
