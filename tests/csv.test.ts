import { describe, expect, it } from "vitest";
import { csvCell, csvToProducts, parseCSV, productTemplate, toCSV } from "../src/lib/csv";

describe("bounded product CSV import", () => {
  it("parses quoted commas, double quotes, CRLF, BOM, and multiline fields", () => {
    expect(parseCSV('\uFEFFname,sku\r\n"Tea, ""Gold""",T1\r\n"Line\nTwo",T2\r\n')).toEqual([
      ["name", "sku"],
      ['Tea, "Gold"', "T1"],
      ["Line\nTwo", "T2"],
    ]);
  });
  it("creates validated product records with explicit defaults", () => {
    const rows = csvToProducts(
      "name,selling_price,cost_price,category\nTea,25.50,10.2500,Drinks\nSoap,4.00,,\n",
    );
    expect(rows[0]).toMatchObject({
      name: "Tea",
      selling_price: "25.50",
      cost_price: "10.2500",
      category_name: "Drinks",
      opening_stock: "0",
      low_stock_threshold: "5",
      unit: "unit",
      is_active: true,
    });
    expect(rows[1].cost_price).toBeNull();
  });
  it("keeps numeric SKU and barcode identifiers as strings", () => {
    expect(csvToProducts("name,selling_price,sku,barcode\nTea,1,000123,00123456")[0]).toMatchObject(
      { sku: "000123", barcode: "00123456" },
    );
  });
  it("rejects malformed and mismatched rows", () => {
    expect(() => parseCSV('name,sku\n"unterminated,T1')).toThrow(/closed/);
    expect(() => parseCSV('name,sku\n"Tea"abc,T1')).toThrow(/unexpected/);
    expect(() => csvToProducts("name,selling_price\nTea,1,extra")).toThrow(/Row 2/);
  });
  it("rejects duplicate or unknown headers rather than silently dropping data", () => {
    expect(() => csvToProducts("name,name,selling_price\nTea,Tea,1")).toThrow(/repeat/);
    expect(() => csvToProducts("name,selling_price,prise\nTea,1,2")).toThrow(/Unknown column/);
    expect(() => csvToProducts("name,cost_price\nTea,1")).toThrow(/selling_price/);
  });
  it("rejects invalid decimals and active states with row context", () => {
    expect(() => csvToProducts("name,selling_price\nTea,1.001")).toThrow(/Row 2/);
    expect(() => csvToProducts("name,selling_price,is_active\nTea,1,yes")).toThrow(/true or false/);
  });
  it("enforces row and byte bounds", () => {
    expect(() => csvToProducts("name,selling_price\n" + "Tea,1\n".repeat(501))).toThrow(/500/);
    expect(() => parseCSV("x".repeat(500001))).toThrow(/500 KB/);
  });
  it("does not seed demo records in the import template", () => {
    expect(parseCSV(productTemplate())).toHaveLength(1);
  });
});
describe("spreadsheet-compatible and formula-safe export", () => {
  it("escapes formula injection even with leading whitespace", () => {
    for (const value of ['=HYPERLINK("evil")', "+SUM(1)", "@cmd", "-cmd|a", "  =1+1", "\t@SUM(1)"])
      expect(csvCell(value)).toMatch(/^['"]/);
    expect(csvCell("-123.45")).toBe("-123.45");
  });
  it("quotes commas, quotes, and newlines", () => {
    expect(csvCell('Tea, "Gold"')).toBe('"Tea, ""Gold"""');
    expect(toCSV(["name", "amount"], [["Tea\nGold", "1.00"]])).toContain('"Tea\nGold",1.00');
  });
});
