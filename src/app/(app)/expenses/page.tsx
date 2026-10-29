import type { Metadata } from "next";
import { ExpensesView } from "@/components/expenses-view";
import { requireShop } from "@/lib/auth";
import { getExpenses } from "@/lib/data";
import type { SearchParams } from "@/lib/dates";

export const metadata: Metadata = { title: "Expenses" };
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { shop } = await requireShop();
  return <ExpensesView {...await getExpenses(await searchParams)} shop={shop} />;
}
