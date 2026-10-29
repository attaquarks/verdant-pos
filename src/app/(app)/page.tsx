import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard-view";
import { requireShop } from "@/lib/auth";
import { getDashboard } from "@/lib/data";
import type { SearchParams } from "@/lib/dates";

export const metadata: Metadata = { title: "Dashboard" };
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { shop } = await requireShop();
  const data = await getDashboard(await searchParams);
  return <DashboardView data={data} shop={shop} />;
}
