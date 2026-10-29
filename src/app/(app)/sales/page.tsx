import type { Metadata } from "next";
import { SalesView } from "@/components/sales-view";
import { requireShop } from "@/lib/auth";
import { getSales } from "@/lib/data";
import type { SearchParams } from "@/lib/dates";

export const metadata: Metadata = { title: "Sales" };
export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { shop } = await requireShop();
  return <SalesView {...await getSales(await searchParams)} shop={shop} />;
}
