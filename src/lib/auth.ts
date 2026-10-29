import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase/server";
import { isSupabaseConfigured } from "./env";
import { AppError, databaseError } from "./errors";
import type { Membership, Shop } from "./types";

export const getUserContext = cache(async () => {
  if (!isSupabaseConfigured()) throw new AppError("Supabase is not configured.", 503);
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user)
    throw new AppError(
      error?.status && error.status >= 500
        ? "Authentication is temporarily unavailable."
        : "Sign in to continue.",
      error?.status && error.status >= 500 ? 503 : 401,
    );
  const membershipResult = await supabase
    .from("shop_memberships")
    .select("shop_id,user_id,role,is_active,revoked_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipResult.error) throw databaseError(membershipResult.error);
  let membership = membershipResult.data as Membership | null;
  let shop: Shop | null = null;
  if (membership?.is_active) {
    const result = await supabase
      .from("shops")
      .select("id,name,currency,time_zone,created_at")
      .eq("id", membership.shop_id)
      .maybeSingle();
    if (result.error) throw databaseError(result.error);
    if (result.data) shop = result.data as Shop;
    else {
      // Revocation may commit between reading the membership and its shop.
      // Refresh the caller's own retained row instead of reporting a DB failure.
      const refreshed = await supabase
        .from("shop_memberships")
        .select("shop_id,user_id,role,is_active,revoked_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (refreshed.error) throw databaseError(refreshed.error);
      membership = refreshed.data as Membership | null;
      if (membership?.is_active)
        throw new AppError("Your shop is unavailable. Contact the shop owner.", 403);
    }
  }
  return { supabase, user, membership, shop };
});
export async function requireShop() {
  if (!isSupabaseConfigured()) redirect("/setup");
  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/login");
    throw error;
  }
  if (context.membership && !context.membership.is_active) redirect("/access-revoked");
  if (!context.shop || !context.membership) redirect("/onboarding");
  return { ...context, shop: context.shop, membership: context.membership };
}
export async function requireUser() {
  if (!isSupabaseConfigured()) redirect("/setup");
  try {
    return await getUserContext();
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/login");
    throw error;
  }
}
export async function requireApiContext(allowNoShop = false) {
  const context = await getUserContext();
  if (context.membership && !context.membership.is_active)
    throw new AppError("Your access to this shop has been revoked. Contact the shop owner.", 403);
  if (!allowNoShop && (!context.shop || !context.membership))
    throw new AppError("Create your shop before recording transactions.", 403);
  return context;
}
