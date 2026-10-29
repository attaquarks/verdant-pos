import type { Metadata } from "next";
import { InventoryView } from "@/components/inventory-view";
import { requireShop } from "@/lib/auth";
import { getInventory } from "@/lib/data";
import type { SearchParams } from "@/lib/dates";

export const metadata: Metadata = { title: "Inventory" };
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { shop } = await requireShop();
  return <InventoryView data={await getInventory(await searchParams)} shop={shop} />;
}
