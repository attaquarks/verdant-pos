import { AppShell } from "@/components/app-shell";
import { requireShop } from "@/lib/auth";
import { getLowStockCount } from "@/lib/data";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { shop, user } = await requireShop();
  const lowStockCount = await getLowStockCount(shop.id);
  return (
    <AppShell shop={shop} userEmail={user.email || "Shop member"} lowStockCount={lowStockCount}>
      {children}
    </AppShell>
  );
}
