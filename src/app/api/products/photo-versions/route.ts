import { requireApiContext } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { errorResponse, json } from "@/lib/http";
import { photoUuid } from "@/lib/product-photos";
export const dynamic = "force-dynamic";

/** Optional batch query, separate from existing product reads for migration safety. */
export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("ids");
    const ids = raw ? raw.split(",") : [];
    if (!ids.length || ids.length > 100) throw new AppError("Provide 1 to 100 product IDs.", 400);
    const parsed = [...new Set(ids.map(photoUuid))];
    const { supabase, shop } = await requireApiContext();
    if (!shop) throw new AppError("Shop unavailable.", 403);
    const result = await supabase
      .from("product_photos")
      .select("product_id,version")
      .eq("shop_id", shop.id)
      .in("product_id", parsed);
    if (result.error) throw new AppError("Photo service unavailable.", 503);
    return json({ photos: result.data ?? [] });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
