import { requireApiContext } from "@/lib/auth";
import { csvToProducts } from "@/lib/csv";
import { todayIn } from "@/lib/dates";
import { AppError, databaseError } from "@/lib/errors";
import { assertMutationOrigin, errorResponse, json, readLimitedJSON } from "@/lib/http";
import { validateAction } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    assertMutationOrigin(request);
    const { action: actionName } = await context.params;
    const { action, data } = validateAction(actionName, await readLimitedJSON(request));
    const { supabase, shop } = await requireApiContext(action === "shop");
    if (!shop && action !== "shop") throw new AppError("Create a shop first.", 403);
    if (shop && typeof data.occurred_on === "string" && data.occurred_on > todayIn(shop.time_zone))
      throw new AppError("Cash movements and expenses cannot be dated in the future.");
    const base = { p_shop_id: shop?.id, p_request_id: data.request_id };
    let rpc: string;
    let args: Record<string, unknown>;
    switch (action) {
      case "product":
        rpc = "save_product";
        args = { ...base, p_product_id: data.product_id, p_product: data.product };
        break;
      case "category":
        rpc = "create_category";
        args = { ...base, p_name: data.name };
        break;
      case "sale":
        rpc = "post_sale";
        args = {
          ...base,
          p_items: data.items,
          p_payment_method: data.payment_method,
          p_customer_name: data.customer_name,
          p_customer_contact: data.customer_contact,
          p_note: data.note,
        };
        break;
      case "receive":
        rpc = "receive_stock";
        args = {
          ...base,
          p_product_id: data.product_id,
          p_quantity: data.quantity,
          p_unit_cost: data.unit_cost,
          p_supplier: data.supplier,
          p_payment_method: data.payment_method,
          p_note: data.note,
        };
        break;
      case "adjust":
        rpc = "adjust_stock";
        args = {
          ...base,
          p_product_id: data.product_id,
          p_quantity_delta: data.quantity_delta,
          p_kind: data.kind,
          p_note: data.note,
        };
        break;
      case "collect":
        rpc = "collect_payment";
        args = {
          ...base,
          p_sale_id: data.sale_id,
          p_amount: data.amount,
          p_method: data.method,
          p_note: data.note,
        };
        break;
      case "return":
        rpc = "return_sale";
        args = {
          ...base,
          p_sale_id: data.sale_id,
          p_items: data.items,
          p_reason: data.reason,
          p_refund_method: data.refund_method,
        };
        break;
      case "reverse":
        rpc = "reverse_sale";
        args = {
          ...base,
          p_sale_id: data.sale_id,
          p_reason: data.reason,
          p_refund_method: data.refund_method,
        };
        break;
      case "expense":
        rpc = "record_expense";
        args = {
          ...base,
          p_description: data.description,
          p_category: data.category,
          p_amount: data.amount,
          p_method: data.method,
          p_occurred_on: data.occurred_on,
        };
        break;
      case "cash":
        rpc = "record_cash_movement";
        args = {
          ...base,
          p_kind: data.kind,
          p_description: data.description,
          p_amount: data.amount,
          p_method: data.method,
          p_occurred_on: data.occurred_on,
        };
        break;
      case "shop": {
        // Intent must stay explicit across retries: a successful bootstrap has
        // already created a membership when its response is lost in transit.
        const creating = data.mode === "create";
        if (!creating && !shop)
          throw new AppError("Create your shop before changing its settings.", 403);
        rpc = creating ? "create_shop" : "update_shop";
        args = {
          ...(creating ? { p_request_id: data.request_id } : base),
          p_name: data.name,
          p_currency: data.currency,
          p_time_zone: data.time_zone,
        };
        break;
      }
      case "import":
        rpc = "import_products";
        args = { ...base, p_products: csvToProducts(data.csv as string) };
        break;
    }
    const result = await supabase.rpc(rpc, args);
    if (result.error) throw databaseError(result.error);
    if (!result.data || typeof result.data !== "object")
      throw new AppError(
        "The server did not confirm a saved record. Retry this unchanged request safely.",
        503,
      );
    return json({ ok: true, data: result.data });
  } catch (error) {
    return errorResponse(error);
  }
}
