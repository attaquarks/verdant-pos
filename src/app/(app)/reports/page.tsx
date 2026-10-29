import type { Metadata } from "next";
import { ReportsView } from "@/components/reports-view";
import { requireShop } from "@/lib/auth";
import { getReport } from "@/lib/data";
import { getDateRange, type SearchParams } from "@/lib/dates";

export const metadata: Metadata = { title: "Reports" };
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { shop } = await requireShop();
  const range = getDateRange(await searchParams, shop.time_zone);
  return (
    <ReportsView
      report={await getReport(shop.id, range.start, range.end)}
      shop={shop}
      range={range}
    />
  );
}
