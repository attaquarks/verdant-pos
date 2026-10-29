import { requireApiContext } from "@/lib/auth";
import { findProducts } from "@/lib/data";
import { errorResponse, json } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireApiContext();
    const products = await findProducts(new URL(request.url).searchParams.get("q") || "");
    return json({ products });
  } catch (error) {
    return errorResponse(error);
  }
}
