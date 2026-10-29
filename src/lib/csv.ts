import { importProductSchema, ValidationError } from "./validation";
import type { z } from "zod";

export type ImportedProduct = z.infer<typeof importProductSchema>;
export const PRODUCT_CSV_HEADERS = [
  "name",
  "category",
  "sku",
  "barcode",
  "unit",
  "cost_price",
  "selling_price",
  "opening_stock",
  "low_stock_threshold",
];

/** Bounded RFC 4180 parser: quoted commas, escaped quotes, and multiline fields. */
export function parseCSV(source: string, maxRows = 500): string[][] {
  const input = source.replace(/^\uFEFF/, "");
  if (input.length > 500000) throw new ValidationError("Import files must be 500 KB or smaller.");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  function pushRow() {
    row.push(field);
    field = "";
    if (row.some((cell) => cell.trim())) rows.push(row);
    row = [];
    closed = false;
    if (rows.length > maxRows + 1)
      throw new ValidationError(`Import at most ${maxRows} products at a time.`);
  }
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === '"') {
      if (field || closed)
        throw new ValidationError("Malformed CSV: quotes must enclose an entire field.");
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      pushRow();
    } else {
      if (closed && !/\s/.test(c))
        throw new ValidationError("Malformed CSV: unexpected text after a closing quote.");
      if (!closed) field += c;
    }
  }
  if (quoted) throw new ValidationError("Malformed CSV: a quoted field was not closed.");
  if (field || row.length || closed) pushRow();
  return rows;
}
export function csvToProducts(source: string): ImportedProduct[] {
  const rows = parseCSV(source);
  if (rows.length < 2) throw new ValidationError("Add a header and at least one product row.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length)
    throw new ValidationError("CSV headers cannot repeat.");
  const allowed = new Set([...PRODUCT_CSV_HEADERS, "category_name", "is_active"]);
  const unknown = headers.find((header) => !allowed.has(header));
  if (unknown)
    throw new ValidationError(
      `Unknown column: ${unknown}. Download the product template for supported columns.`,
    );
  if (headers.includes("category") && headers.includes("category_name"))
    throw new ValidationError("Use category or category_name, not both.");
  for (const required of ["name", "selling_price"])
    if (!headers.includes(required))
      throw new ValidationError(`Missing required column: ${required}.`);
  return rows.slice(1).map((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length !== headers.length)
      throw new ValidationError(
        `Row ${rowNumber}: expected ${headers.length} columns, found ${cells.length}.`,
      );
    const row = Object.fromEntries(headers.map((header, i) => [header, cells[i].trim()]));
    const active = row.is_active?.toLowerCase();
    if (active && !["true", "false", "1", "0"].includes(active))
      throw new ValidationError(`Row ${rowNumber}: is_active must be true or false.`);
    const parsed = importProductSchema.safeParse({
      name: row.name,
      category_name: row.category || row.category_name || null,
      sku: row.sku || null,
      barcode: row.barcode || null,
      unit: row.unit || "unit",
      cost_price: row.cost_price || null,
      selling_price: row.selling_price,
      opening_stock: row.opening_stock || "0",
      low_stock_threshold: row.low_stock_threshold || "5",
      is_active: !["false", "0"].includes(active || ""),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ValidationError(`Row ${rowNumber}, ${issue.path.join(".")}: ${issue.message}`);
    }
    return parsed.data;
  });
}
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Neutralize spreadsheet formulas, including leading whitespace/control characters.
  if (/^[\s\p{Cc}]*[=+@-]/u.test(text) && !/^-\d+(?:\.\d+)?$/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
export function toCSV(headers: string[], rows: unknown[][]): string {
  return (
    "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
  );
}
export function productTemplate(): string {
  return toCSV(PRODUCT_CSV_HEADERS, []);
}
