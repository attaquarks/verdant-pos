import { requireApiContext } from "@/lib/auth";
import { productTemplate } from "@/lib/csv";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    await requireApiContext();
    return new Response(productTemplate(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="verdant-product-template.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
