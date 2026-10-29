import { z } from "zod";
import { requireApiContext } from "@/lib/auth";
import { getMovements } from "@/lib/data";
import { AppError } from "@/lib/errors";
import { errorResponse, json } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireApiContext();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new AppError("Invalid product reference.");
    return json({ movements: await getMovements(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
