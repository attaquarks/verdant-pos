export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export function databaseError(error: { code?: string; message: string }): AppError {
  if (error.code === "42501")
    return new AppError("You do not have permission to perform this action.", 403);
  if (error.code === "23505") {
    if (error.message.includes('"idempotency_shop_request_idx"'))
      return new AppError(
        "This request was already recorded in the shop by another signed-in user. Review the transaction history before starting a new request.",
        409,
      );
    if (error.message.startsWith("Idempotency key reused"))
      return new AppError(
        "This request key was already used for different values. Review the saved transaction before starting a new request.",
        409,
      );
    return new AppError(
      "This SKU, barcode, category, or request already exists. Check the values and try again.",
      409,
    );
  }
  if (error.code === "23503")
    return new AppError("A linked record is unavailable or belongs to another shop.", 409);
  if (["P0001", "22023", "23514", "22003", "22P02"].includes(error.code || "")) {
    const message =
      error.code === "22003" ? "An amount exceeds the supported range." : error.message;
    return new AppError(message, 409);
  }
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code || ""))
    return new AppError(
      "Database setup is incomplete. Apply the Supabase migrations, then try again.",
      503,
    );
  return new AppError(
    "The database could not complete this request. Please try again; unchanged retries are safe.",
    503,
  );
}
