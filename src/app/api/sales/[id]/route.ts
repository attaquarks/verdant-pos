import { z } from "zod";
import { requireApiContext } from "@/lib/auth";
import { getSaleDetail } from "@/lib/data";
import { AppError } from "@/lib/errors";
import { errorResponse, json } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireApiContext();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new AppError("Invalid sale reference.");
    return json(await getSaleDetail(id));
  } catch (error) {
    return errorResponse(error);
  }
}
